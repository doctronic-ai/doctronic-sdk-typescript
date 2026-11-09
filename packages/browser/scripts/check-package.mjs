#!/usr/bin/env node
// Checks @doctronic-ai/browser as npm would publish it. Run `npm run build` in the package first.
//
//   node scripts/check-package.mjs
//
// It checks the tarball's file list; that the tarball depends on nothing, and holds no reference
// to a private or workspace package, no Node built-in, and no React; then installs it into a copy
// of test/consumer/ in a temporary directory outside the workspace, type-checks that consumer
// under bundler and NodeNext resolution with the DOM's types and none of Node's, imports it in
// Node with no `window` or `document` (as server-side rendering does), and compares the values the
// declarations export with the runtime ones.

import { execFileSync } from 'node:child_process';
import { builtinModules, createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NAME = '@doctronic-ai/browser';

// Exactly what the tarball may contain. A new file or a missing one fails the check.
const EXPECTED_FILES = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.js.map',
  'package.json',
];

const TSCONFIGS = { Bundler: 'tsconfig.bundler.json', NodeNext: 'tsconfig.nodenext.json' };

const DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
];

const builtins = builtinModules.filter((name) => !name.startsWith('_')).join('|');
// Module specifiers in code and declarations: `from '...'`, `import('...')`, `require('...')`.
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s*)(["'])([^"']+)\1/gm;
const FORBIDDEN_SPECIFIERS = [
  [new RegExp(`^(node:.*|(${builtins})(/.*)?)$`), 'a Node built-in'],
  [/^(react|react-dom|preact)(\/.*)?$/, 'React'],
  [/^@doctronic-ai\//, 'another Doctronic package'],
];
const FORBIDDEN_TEXT = [
  [/\/\/\/\s*<reference\s+types=["']node["']/, "Node's types"],
  [/\bworkspace:/, 'a workspace reference'],
];

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

// `--ignore-scripts`: the build has already run. npm 10 can print script output ahead of the
// JSON, so the JSON is read from its first line, `[`.
function pack(args) {
  const stdout = run(npm, ['pack', '--json', '--ignore-scripts', ...args], { cwd: root });
  const start = stdout.search(/^\[$/m);
  if (start === -1) throw new Error(`npm pack printed no JSON:\n${stdout}`);
  const [result] = JSON.parse(stdout.slice(start));
  return result;
}

function checkFiles() {
  if (!existsSync(join(root, 'dist/index.js'))) {
    throw new Error('No dist/. Run `npm run build` in packages/browser first.');
  }
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

function filesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** What the installed package holds: no dependencies, and nothing private, Node-only or React. */
function checkContents(installed) {
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  for (const field of DEPENDENCY_FIELDS) {
    const names = Object.keys(manifest[field] ?? {});
    if (names.length) fail(`package.json has ${field}: ${names.join(', ')}.`);
  }
  let problems = 0;
  for (const file of filesIn(installed)) {
    // The code and its declarations. package.json is checked above; the source map only maps them.
    if (!/\.(js|d\.ts)$/.test(file)) continue;
    const name = relative(installed, file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(SPECIFIER)) {
      for (const [pattern, what] of FORBIDDEN_SPECIFIERS) {
        if (pattern.test(match[2])) {
          fail(`${name} imports ${what}: "${match[2]}".`);
          problems += 1;
        }
      }
    }
    for (const [pattern, what] of FORBIDDEN_TEXT) {
      if (pattern.test(text)) {
        fail(`${name} has ${what}.`);
        problems += 1;
      }
    }
  }
  if (!problems) {
    console.log(
      'The tarball has no dependencies and no reference to a Doctronic package, a Node built-in or React.',
    );
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

// Imports the package in plain Node: no `window`, no `document`, as server-side rendering does.
// Importing it must not touch either, nor add a global.
function runtimeExports(cwd) {
  const script = `
    const before = new Set(Object.getOwnPropertyNames(globalThis));
    for (const name of ['window', 'document']) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { throw new Error('Importing the package read ' + name + '.'); },
      });
    }
    const browser = await import(${JSON.stringify(NAME)});
    for (const name of ['window', 'document']) delete globalThis[name];
    const added = Object.getOwnPropertyNames(globalThis).filter((name) => !before.has(name));
    if (added.length) throw new Error('Importing the package added globals: ' + added.join(', '));
    new browser.DoctronicBrowser({ publishableKey: 'pk_test_example' }).dispose();
    console.log(JSON.stringify(Object.keys(browser).sort()));
  `;
  return JSON.parse(run(process.execPath, ['--input-type=module', '-e', script], { cwd }));
}

function checkConsumer() {
  const ts = require('typescript');
  // Outside the repository, so nothing resolves through the workspace.
  const work = mkdtempSync(join(tmpdir(), 'doctronic-browser-consumer-'));
  try {
    const { filename } = pack(['--pack-destination', work]);
    const consumer = join(work, 'consumer');
    cpSync(join(root, 'test/consumer'), consumer, { recursive: true });
    mkdirSync(join(consumer, 'node_modules'), { recursive: true });
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
      { cwd: consumer },
    );
    const installed = join(consumer, 'node_modules', NAME);
    checkContents(installed);

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
        console.log(`The consumer type-checks under ${label} resolution, without Node's types.`);
      }
      if (file === TSCONFIGS.NodeNext) nodenext = program;
    }

    const declared = declaredValues(ts, nodenext, 'dist/index.d.ts');
    const runtime = runtimeExports(consumer);
    console.log('Importing it in Node, with no window or document, touches neither.');
    const notAtRuntime = declared.filter((name) => !runtime.includes(name));
    const undeclared = runtime.filter((name) => !declared.includes(name));
    if (notAtRuntime.length) {
      fail(`Declared as values but missing at runtime: ${notAtRuntime.join(', ')}.`);
    }
    if (undeclared.length) fail(`Exported at runtime but not declared: ${undeclared.join(', ')}.`);
    if (!notAtRuntime.length && !undeclared.length) {
      console.log(`The ${runtime.length} runtime exports match the declarations.`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

checkFiles();
checkConsumer();
if (failed) process.exitCode = 1;
