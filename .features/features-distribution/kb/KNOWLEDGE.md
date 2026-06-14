---
description: "Use when working on the build pipeline, publishing a new version, understanding distribution channels, modifying what gets shipped in the npm package, updating the CI workflow, or diagnosing install failures. Keywords: build, tsup, dist, publish, npm, release, version, install.sh, CI, GitHub Actions, shebang, prepublishOnly."
category: architecture
---

# Build and Distribution

## Overview

The features CLI is a TypeScript project bundled into a single ESM file by tsup and distributed through two parallel channels: the npm registry (`npm install -g features`) and a GitHub tarball curl-pipe script (`install.sh`). The build configuration is intentionally minimal — no tsup config file, no release automation — but several non-obvious decisions make both channels work reliably. Understanding those decisions is essential before touching any build, publish, or packaging step.

## System Context

- **Purpose**: Compile TypeScript source into a single executable JS bundle and ship it as a global CLI tool
- **Entry point**: `src/index.ts` → `dist/index.js`
- **Runtime requirement**: Node.js ≥ 20 (ES2022 syntax, ESM modules)
- **Bundler**: tsup 8.4.0 (wraps esbuild; no config file — all options are in the `build` script)
- **Registry**: npmjs.org, package name `features`

## Component Architecture

### Build Pipeline

```
src/index.ts  (TypeScript, strict mode, NodeNext modules)
      │
      ▼
  tsup (esbuild)
      │
      ├── dist/index.js    — ESM bundle, shebang prepended, with tsup-managed dependency bundling/externalization
      └── dist/index.d.ts  — Type declarations (for programmatic consumers)
```

tsup is invoked with no config file. The full build command is in `package.json`:

```json
// package.json — the entire build configuration lives here, not in a config file
"scripts": {
  "build": "tsup src/index.ts --format esm --dts --clean",
  "dev":   "tsup src/index.ts --format esm --watch"
}
```

**Key takeaways**: `--format esm` enforces a single ESM output (no CJS). `--dts` generates `dist/index.d.ts`. `--clean` wipes `dist/` before every build, preventing stale artifacts.

### TypeScript Configuration

`tsconfig.json` configures the TypeScript compiler for the source but tsup uses esbuild for the actual transpilation — tsup invokes `tsc` only for type-checking and `.d.ts` generation:

```json
// tsconfig.json — notable settings
{
  "compilerOptions": {
    "target": "ES2022",          // modern syntax (top-level await, etc.)
    "module": "NodeNext",        // ESM with .js extensions on imports
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,         // enables --dts in tsup
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Key takeaways**: `NodeNext` module mode requires `.js` extensions on relative imports in source TypeScript files (even though the files are `.ts`). This is the import style the entire codebase follows.

### npm Package Scope

The `files` array in `package.json` is the sole gate on what ships to npm:

```json
// package.json
"files": [
  "dist",        // the compiled CLI bundle + type declarations
  "prompts",     // prompt templates read by the CLI at runtime
  "viewer-dist"  // static assets served by `features serve`
]
```

**Key takeaways**: `src/` is never shipped. `node_modules/` is never shipped (tsup bundles most runtime deps; external package deps install normally). Only runtime artifacts such as `dist/`, `prompts/`, and `viewer-dist/` reach consumers.

### Version Management

Version is maintained manually in **two places** that must stay in sync:

```typescript
// src/version.ts — embedded in dist/index.js at build time
export const VERSION = '0.1.0';
```

```json
// package.json
{ "version": "0.1.0" }
```

There is no automation to sync these. Before publishing, bump both files to the same value.

## Component Interactions

### npm Lifecycle Hook Design

The lifecycle scripts in `package.json` encode a careful decision about when builds happen:

```json
"scripts": {
  "prepare":        "true",             // no-op: suppressed intentionally
  "prepublishOnly": "npm run build"     // auto-build only on npm publish
}
```

- **`prepare` is `"true"` (no-op)**: Normally `prepare` runs on `npm install` and after `npm pack`. It is suppressed here so that consumers who install directly from the GitHub repo (via `install.sh`) do not trigger a build — they don't have `tsup` installed. The no-op string `"true"` is the canonical way to disable a lifecycle hook without removing the field.
- **`prepublishOnly` builds**: When a maintainer runs `npm publish`, npm calls `prepublishOnly` first, which compiles fresh TypeScript. This prevents publishing stale `dist/` artifacts.

### Why `dist/` Is Committed to Git

This is the most important non-obvious design decision. The `dist/` directory is tracked in git (not gitignored):

```
# .gitignore — dist/ is NOT listed here
node_modules/
*.tsbuildinfo
.DS_Store
.idea/
```

**Why**: `install.sh` installs by downloading the GitHub `main` branch tarball and running `npm pack` on it directly — no build step. If `dist/` were not committed, the tarball would contain no executable and global install would silently fail. The git commit message captures the rationale: `"fix: commit dist/ and remove prepare script for reliable git installs"`.

**Implication**: Every merge to `main` that changes source code should include a rebuilt `dist/`. The CI build validates that `npm run build` succeeds, but it does not commit the output.

## Integration Patterns

### Channel 1: npm Registry

Standard global install from the registry:

```
npm publish
  → prepublishOnly: npm run build      (fresh build)
  → npm packs files[] + package.json
  → uploads to npmjs.org
```

Consumer installs with:

```bash
npm install -g features
```

### Channel 2: GitHub Tarball via `install.sh`

`install.sh` is a POSIX shell script that:

1. Validates Node.js ≥ 18 and npm are present
2. Downloads `https://github.com/michael-elkabetz/features/archive/refs/heads/main.tar.gz`
3. Extracts into a temp directory
4. Runs `npm install --production --ignore-scripts` (installs deps, skips all hooks)
5. Runs `npm pack` to create a `.tgz`
6. Runs `npm install -g <tarball>.tgz` to install globally
7. Validates `features` is on PATH

The `--ignore-scripts` flag in step 4 is essential: it prevents `prepublishOnly` and any other hooks from running — which would attempt a tsup build that isn't available. This channel works because `dist/` is already in the tarball.

```bash
# install.sh — core installation sequence
npm install --production --ignore-scripts  # deps only, no build hooks
npm pack --pack-destination "$TMPDIR_CREATED"
npm install -g "$TMPDIR_CREATED"/features-*.tgz
```

### CI Validation

`.github/workflows/ci.yml` runs on every push to `main` and every PR:

```yaml
strategy:
  matrix:
    node-version: [20, 22]  # tests the declared engine range
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
      cache: npm            # caches npm's package store, speeds up npm ci
  - run: npm ci             # clean install from package-lock.json
  - run: npm run build      # validates TypeScript compiles and tsup succeeds
```

CI does **not** publish, release, or bump versions. It is purely a build validation gate across the three supported Node versions.

## Constraints

**Viewer UI convention**: `viewer-dist/` is a hand-authored static viewer for `features serve`. Keep cards focused on user-facing navigation and content shape; avoid reintroducing status/complexity/provenance badges into primary area/feature cards unless they directly affect actionability. Area pages keep the hero informational, with no search/explore CTA buttons or KPI cards. The sidebar lists navigation only; do not reintroduce the analysis status card. Area feature cards intentionally omit area-name, code-reference-count, and stale-status badges. Source references should read as evidence cards with code hidden until opened. Feature flows use a compact subway-route presentation: wrapping stops, a luminous track, and dense cards that avoid tall timelines, generic KPI-style cards, and page-level horizontal scroll. The skill drawer renders markdown with the local static parser in `raise-app.js`; do not regress it to escaped `<pre>` output.

**What to include in `files[]`**: Only add directories that must reach the consumer at runtime. Static asset directories like `prompts/` and the `viewer-dist/` web viewer belong here. Development config, source files, and test fixtures do not.

**Node version floor**: The `engines.node` field (`">=20"`) is enforced at install time by npm and checked explicitly in `install.sh`. Do not use Node APIs or syntax unavailable in Node 20.

**ESM only**: `"type": "module"` in `package.json` means the entire package is ESM. There is no CJS build. Consumers who require CommonJS cannot use this package as a library. The CLI use case (global install) is unaffected since Node always runs `.js` files as ESM when `type: module` is set.

**No release automation**: Version bumps, changelog generation, and npm publish are entirely manual. There is no semantic-release, changesets, or similar tooling. Update `package.json` and `src/version.ts` together before publishing.

## Anti-Patterns

- **Removing `dist/` from git** — breaks the `install.sh` GitHub tarball channel; consumers who curl-pipe the script will install a package with no executable
- **Restoring `prepare: "npm run build"`** — causes `npm install` to attempt a tsup build in environments (like `install.sh`) where tsup is not a dependency, breaking installs
- **Adding `src/` to `files[]`** — ships TypeScript source to consumers who don't need it, inflating package size
- **Bumping version in only one place** — `package.json` and `src/version.ts` diverge silently; the CLI will report the wrong version to users

## Gotchas and Edge Cases

- **Stale `dist/` on `main`**: If source changes are merged without rebuilding `dist/`, the GitHub tarball install gets a binary that does not match the source. The CI job confirms the build succeeds but does not commit the output — the developer must run `npm run build` and commit `dist/` before merging changes intended for release.
- **`npm ci` vs `npm install`**: CI uses `npm ci` (strict lockfile adherence). Local dev can use `npm install`. These must stay consistent — if `package-lock.json` is stale CI will fail before reaching the build step.
- **PATH after global install**: `install.sh` warns users if `features` is not found on PATH after install and prints the fix (`export PATH="$(npm config get prefix)/bin:$PATH"`). This is a common failure mode on macOS with nvm or non-standard npm prefix configurations.
- **`--dts` adds ~1s to build time**: tsup delegates `.d.ts` generation to `tsc`, which is slower than esbuild. This is acceptable for the single-entry CLI use case but would matter if the build were invoked frequently.

## Related

- `package.json` — bin declaration, files array, lifecycle scripts, engines constraint
- `viewer-dist/` — static web viewer served by `features serve`; must stay in `files[]`
- `tsconfig.json` — TypeScript compiler options (NodeNext, ES2022, strict)
- `.github/workflows/ci.yml` — Node 20/22 build matrix
- `install.sh` — GitHub tarball installation channel
- `src/version.ts` — version constant embedded in the compiled binary
- `.features/features-cli-commands/kb/KNOWLEDGE.md` — how CLI commands are wired into the entry point that tsup compiles
- `.features/features-prompt-templates/kb/KNOWLEDGE.md` — explains `prompts/` directory, which is the other artifact shipped in the package
