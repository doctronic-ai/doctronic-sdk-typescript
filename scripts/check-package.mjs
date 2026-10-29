#!/usr/bin/env node
// Checks the package as npm would publish it. Run `npm run build` first.
//
//   node scripts/check-package.mjs files   # the tarball's file list only
//   node scripts/check-package.mjs         # the file list, then a consumer install
//
// The consumer check packs the tarball, installs it into a copy of test/consumer/ in a temporary
// directory, type-checks that consumer under NodeNext (ESM and CommonJS), bundler, and node10
// resolution, and compares the values the declarations export with what the ESM and CommonJS
// builds export at runtime. A class exported with `export type` passes the type check but isn't
// there at runtime, and this catches it.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Exactly what the tarball may contain. A new file or a missing one fails the check.
const EXPECTED_FILES = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/index.cjs',
  'dist/index.cjs.map',
  'dist/index.d.cts',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.js.map',
  'package.json',
];

const TSCONFIGS = {
  'NodeNext (ESM and CommonJS)': 'tsconfig.nodenext.json',
  Bundler: 'tsconfig.bundler.json',
  'Node10 (CommonJS)': 'tsconfig.node10.json',
};

let failed = false;
function fail(message) {
  console.error(`::error::${message}`);
  failed = true;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

// The build has already run, so `--ignore-scripts` skips `prepare`. npm 10 runs it anyway and its
// output lands on stdout ahead of the JSON, so the JSON is read from its first line, `[`.
function pack(args) {
  const stdout = run(npm, ['pack', '--json', '--ignore-scripts', ...args], { cwd: root });
  const start = stdout.search(/^\[$/m);
  if (start === -1) throw new Error(`npm pack printed no JSON:\n${stdout}`);
  const [result] = JSON.parse(stdout.slice(start));
  return result;
}

function checkFiles() {
  if (!existsSync(join(root, 'dist/index.js')))
    throw new Error('No dist/. Run `npm run build` first.');
  const files = pack(['--dry-run'])
    .files.map((file) => file.path)
    .sort();
  const unexpected = files.filter((file) => !EXPECTED_FILES.includes(file));
  const missing = EXPECTED_FILES.filter((file) => !files.includes(file));
  if (unexpected.length) fail(`The tarball has unexpected files: ${unexpected.join(', ')}.`);
  if (missing.length) fail(`The tarball is missing files: ${missing.join(', ')}.`);
  if (!unexpected.length && !missing.length) {
    console.log(`The tarball has the ${files.length} expected files.`);
  }
}

// The names a declaration file exports as values, read the way a consumer's compiler reads them.
function declaredValues(ts, program, file) {
  const checker = program.getTypeChecker();
  const source = program.getSourceFiles().find((sf) => sf.fileName.endsWith(file));
  if (!source) throw new Error(`The consumer program didn't load ${file}.`);
  const values = [];
  for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
    let target = symbol;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      const typeOnly = symbol.declarations?.some(
        (declaration) =>
          ts.isExportSpecifier(declaration) &&
          (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly),
      );
      if (typeOnly) continue;
      target = checker.getAliasedSymbol(symbol);
    }
    if (target.flags & ts.SymbolFlags.Value) values.push(symbol.name);
  }
  return values.sort();
}

function runtimeExports(cwd, format) {
  const script = 'console.log(JSON.stringify(Object.keys(sdk).sort()))';
  const args =
    format === 'esm'
      ? ['--input-type=module', '-e', `const sdk = await import('@doctronic-ai/sdk'); ${script}`]
      : ['-e', `const sdk = require('@doctronic-ai/sdk'); ${script}`];
  return JSON.parse(run(process.execPath, args, { cwd }));
}

function compare(label, declared, runtime) {
  const notAtRuntime = declared.filter((name) => !runtime.includes(name));
  const undeclared = runtime.filter((name) => !declared.includes(name));
  if (notAtRuntime.length) {
    fail(`${label}: declared as values but missing at runtime: ${notAtRuntime.join(', ')}.`);
  }
  if (undeclared.length)
    fail(`${label}: exported at runtime but not declared: ${undeclared.join(', ')}.`);
  if (!notAtRuntime.length && !undeclared.length) {
    console.log(`${label}: the ${runtime.length} runtime exports match the declarations.`);
  }
}

function checkConsumer() {
  const ts = require('typescript');
  const work = mkdtempSync(join(tmpdir(), 'doctronic-sdk-consumer-'));
  try {
    const { filename } = pack(['--pack-destination', work]);
    const consumer = join(work, 'consumer');
    cpSync(join(root, 'test/consumer'), consumer, { recursive: true });
    run(
      npm,
      [
        'install',
        '--no-save',
        '--no-package-lock',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        join(work, filename),
      ],
      {
        cwd: consumer,
      },
    );
    // The consumer uses this repository's Node types rather than downloading its own.
    mkdirSync(join(consumer, 'node_modules/@types'), { recursive: true });
    symlinkSync(
      join(root, 'node_modules/@types/node'),
      join(consumer, 'node_modules/@types/node'),
      'dir',
    );

    let nodenext;
    for (const [label, file] of Object.entries(TSCONFIGS)) {
      const config = ts.getParsedCommandLineOfConfigFile(
        join(consumer, file),
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
            throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
          },
        },
      );
      const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      if (diagnostics.length) {
        const host = {
          getCanonicalFileName: (f) => f,
          getCurrentDirectory: () => consumer,
          getNewLine: () => '\n',
        };
        console.error(ts.formatDiagnostics(diagnostics, host));
        fail(`The consumer doesn't type-check under ${label} resolution.`);
      } else {
        console.log(`The consumer type-checks under ${label} resolution.`);
      }
      if (file === TSCONFIGS['NodeNext (ESM and CommonJS)']) nodenext = program;
    }

    compare(
      'ESM',
      declaredValues(ts, nodenext, 'dist/index.d.ts'),
      runtimeExports(consumer, 'esm'),
    );
    compare(
      'CommonJS',
      declaredValues(ts, nodenext, 'dist/index.d.cts'),
      runtimeExports(consumer, 'cjs'),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const mode = process.argv[2] ?? 'all';
if (mode !== 'files' && mode !== 'all') {
  console.error('Usage: node scripts/check-package.mjs [files]');
  process.exit(2);
}
checkFiles();
if (mode === 'all') checkConsumer();
if (failed) process.exitCode = 1;
