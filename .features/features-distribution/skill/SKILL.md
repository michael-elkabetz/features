---
name: features-distribution
description: >
  Build pipeline, publishing, and distribution for the features CLI. Use this skill whenever the
  task involves: running or modifying the build (tsup, esbuild, dist/), publishing a new version
  to npm, updating install.sh, adding or removing entries from the files[] array in package.json,
  bumping the version, diagnosing install failures from either channel (npm registry or GitHub
  tarball), modifying the CI workflow, understanding why dist/ is committed to git, or touching
  src/version.ts. Keywords: build, tsup, dist, publish, npm, release, version, install.sh, CI,
  GitHub Actions, shebang, prepublishOnly. Always trigger this skill — even if the user doesn't
  say "distribution" — whenever they're working on anything that affects what gets compiled,
  packaged, or shipped.
---

# features-distribution

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-distribution/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Critical Architecture Summary

Before reading any file, internalize these non-obvious facts — they exist because of real failures and must not be reversed:

### Two Distribution Channels

The CLI ships through two parallel channels that have different requirements:

| Channel | How it works | Key constraint |
|---|---|---|
| npm registry | `npm publish` → `prepublishOnly` builds fresh | `dist/` can be built on-demand |
| GitHub tarball | `install.sh` downloads main, runs `npm pack` | `dist/` **must already be in git** |

### Why `dist/` Is Committed to Git

`install.sh` downloads a raw GitHub tarball and runs `npm pack` directly — there is no build step. If `dist/` is not committed, the tarball contains no executable and the install silently fails. **Never add `dist/` to `.gitignore`.**

### Why `prepare` Is a No-Op

`prepare` is set to `"true"` (not removed, not set to the build command). This is intentional: `prepare` runs on `npm install`, and the `install.sh` channel uses `npm install --production --ignore-scripts`. If `prepare` ran the build, environments without `tsup` would fail. The correct hook for builds is `prepublishOnly` only.

### Version Lives in Two Places

Both must be updated together before any publish. They diverge silently otherwise:
- `package.json` → `"version"` field
- `src/version.ts` → `export const VERSION = '...'`

### What Ships to npm

Only what is listed in the `files` array reaches consumers:
```json
"files": ["dist", "prompts"]
```
`src/` is never shipped. `node_modules/` is never shipped (tsup bundles all runtime deps into `dist/index.js`).

---

## Tasks and Step-by-Step Instructions

### Task: Building the CLI

1. Read `package.json` to confirm the current build script.
2. The canonical build command is:
   ```bash
   npm run build
   ```
   Which expands to:
   ```bash
   tsup src/index.ts --format esm --dts --clean
   ```
3. `--clean` wipes `dist/` before building — this is correct behavior. Do not remove it.
4. After building, `dist/index.js` and `dist/index.d.ts` should exist.
5. If changes are intended for release, commit `dist/` to git alongside source changes.

### Task: Publishing a New Version to npm

1. Read `package.json` and `src/version.ts`.
2. Bump the version in **both files** to the same new value.
3. Run `npm run build` to verify the build is clean (this also happens automatically in `prepublishOnly`, but verify first).
4. Commit the version bump and the rebuilt `dist/`:
   ```bash
   git add package.json src/version.ts dist/
   git commit -m "chore: bump version to X.Y.Z"
   ```
5. Publish:
   ```bash
   npm publish
   ```
   `prepublishOnly` will run `npm run build` again automatically — this is the safety net, not the primary build.
6. Tag the release in git if desired (no automation exists for this — it's manual).

### Task: Modifying What Ships in the npm Package

1. Read `package.json`, specifically the `files` array.
2. Only add entries that are needed at runtime by the installed CLI. The rule: if the CLI reads the directory at runtime, it belongs in `files[]`. If it's source, config, or dev tooling, it does not.
3. Do NOT add `src/`, `node_modules/`, `.github/`, or test fixtures.
4. After modifying `files[]`, run `npm pack --dry-run` to verify the tarball contents before publishing.

### Task: Updating the CI Workflow

1. Read `.github/workflows/ci.yml`.
2. The CI matrix tests Node 18, 20, and 22. This covers the declared `engines.node` range (`>=18`).
3. The CI job does exactly this and nothing more: `npm ci` → `npm run build`.
4. Do not add publish steps, version bump automation, or release logic to CI — these are manual by design.
5. If adding a new Node version to the matrix, ensure the build script and source do not use APIs unavailable in that version.

### Task: Modifying `install.sh`

1. Read `install.sh` to understand the current flow.
2. The core sequence that must be preserved:
   ```bash
   npm install --production --ignore-scripts   # deps only, no hooks
   npm pack --pack-destination "$TMPDIR_CREATED"
   npm install -g "$TMPDIR_CREATED"/features-*.tgz
   ```
3. `--ignore-scripts` is essential on the first `npm install`. Removing it would attempt to run `prepublishOnly`, which calls `tsup`, which is not installed in a fresh environment.
4. After any change, test the script end-to-end in a clean environment (no local `node_modules`, no global `features`).

### Task: Diagnosing Install Failures

**npm registry install fails:**
- Check `npm run build` locally — TypeScript errors will block `prepublishOnly`.
- Check `engines.node` constraint — npm enforces this at install time.
- Check the `files` array — a missing entry means the file is absent from the published package.

**GitHub tarball install fails:**
- First suspect: `dist/` is not committed to git on the `main` branch. Run `git ls-files dist/` to check.
- Second suspect: `prepare` was accidentally restored to run a build. Check `package.json`.
- Third suspect: PATH issue after install — `features` is installed but not on PATH. The fix:
  ```bash
  export PATH="$(npm config get prefix)/bin:$PATH"
  ```

**`npm ci` fails in CI:**
- `package-lock.json` is likely stale relative to `package.json`. Run `npm install` locally and commit the updated lockfile.

### Task: Adding a Runtime Dependency

1. Install normally: `npm install <package>`.
2. tsup bundles all dependencies at build time into `dist/index.js`. There is no need to add dependencies to `files[]`.
3. Rebuild: `npm run build`.
4. Commit both the updated `package.json`, `package-lock.json`, and the rebuilt `dist/`.

---

## Final Step: Knowledge Sync

After completing all changes above, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `.features/features-distribution/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new patterns introduced by your changes
   - Any conventions that changed as a result of your work
   - Any sections that no longer reflect reality — remove or correct them
   - New entries in "Related" or "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
