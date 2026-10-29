# Contributing

Thanks for helping improve the Doctronic TypeScript SDK. Report a security vulnerability privately,
as [SECURITY.md](SECURITY.md) describes, never in a public issue or pull request.

**Never put API tokens, webhook secrets, patient data, or PHI in an issue, a pull request, a commit,
a test, or a fixture.** Tests use synthetic data and run against a local mock server; they refuse
any other host.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need Node 20 or later. CI tests Node 20, 22, 24, and 26.

```bash
npm ci
```

## Build and test

```bash
npm run lint        # ESLint and Prettier. `npm run format` fixes formatting.
npm run typecheck
npm test
npm run build
npm run check:package
```

`npm run check:package` needs a build first. It checks the tarball's file list, installs the
tarball into the consumer in `test/consumer/`, type-checks that consumer under NodeNext (ESM and
CommonJS), bundler, and node10 resolution, and checks that the declarations and the runtime
export the same values.

## Generated code

`src/generated/` is generated from the Doctronic API contract. **Never edit it by hand**: change
the contract or the generator instead. CI regenerates it and fails on any difference.

- `src/generated/schema.ts` has the types, from `openapi-typescript`.
- `src/generated/operations.ts` has the runtime facts the client needs about each operation:
  idempotency, user scope, streaming, documented statuses, and `409` codes, including the ones the
  contract marks retryable in `x-doctronic-retryable-codes`.

`npm run generate` reads `openapi/doctronic-v1.json`, a pinned copy of the contract the docs
publish at https://docs.doctronic.ai/openapi/doctronic-v1.json. It generates only operations that
take the organization's API token, and lists the ones it skips, such as browser-only operations.
The generator is `scripts/generate.mjs`, and its reading of the contract is in
`scripts/contract.mjs`, with tests in `test/contract.test.ts`.

To pick up a new contract by hand:

```bash
curl --fail --silent --show-error --output openapi/doctronic-v1.json \
  https://docs.doctronic.ai/openapi/doctronic-v1.json
npm run generate
```

Pass `--contract <path|url>` to generate from another copy without touching the pinned one.

Usually you don't need to: `regenerate.yml` updates the pinned copy whenever the docs publish a
new contract, and daily, and opens a pull request. `contract-drift.yml` reports daily when the
published contract differs from the pinned copy.

A new operation gets types and runtime facts from the generator, but no method. Add a resource
method in `src/` with tests, and add it to the README's resource table. Merge the regenerated code
first, then the methods in a follow-up pull request: the regenerate workflow rebuilds its branch
on every run.

## Pull requests

- Write commit messages and pull request titles as
  [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `build:`,
  `ci:`, and so on. Pull requests are squash-merged, so the title becomes the commit on `main`.
- `main` requires an approving review, passing checks, resolved conversations, a branch that's up
  to date, and signed commits.
- Add a line under the next version in [CHANGELOG.md](CHANGELOG.md) for any change users can see.

## Releases

Maintainers release from a `vX.Y.Z` tag on `main`. `.github/workflows/release.yml` checks the
version and the CHANGELOG entry, publishes to npm through trusted publishing, and creates the
GitHub Release. Its header lists what a release needs.
