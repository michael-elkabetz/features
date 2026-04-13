---
description: "Use when adding a new repository, extending FilesystemRepository, understanding how data access is structured, wiring dependencies, or reading/writing files in the project. Keywords: repository, FilesystemRepository, FeatureRepository, filesystem, data access, constructor injection, Result, rootDir, path resolution."
category: component-patterns
---

# Repository Layer

## Overview

This project has two repositories: `FilesystemRepository`, which wraps Node.js `fs/promises` behind a consistent `Result<T>` interface, and `FeatureRepository`, a domain-level repository that uses `FilesystemRepository` to read and list features. There is no database — all persistence is filesystem-based.

Repositories are the lowest data-access layer. Services orchestrate across repositories and clients; repositories only touch the filesystem. This boundary is load-bearing: repositories never import from services, clients, or UI. All error handling in repositories is via `try/catch` → `fail()` — they never throw.

---

## Core Responsibilities

**Repositories should:**
- Wrap Node.js I/O (`fs/promises`) with `Result<T>` error handling
- Resolve relative paths against a stable `rootDir`
- Return domain types (`Feature[]`, `string` content) — not raw Node.js types
- Fail explicitly via `fail('FILESYSTEM_ERROR', ...)` so callers can check `.ok`

**Repositories should NOT:**
- Import from services, clients, commands, or UI
- Contain business logic (that belongs in services)
- Throw exceptions (use `fail()` instead)
- Prompt the user or produce terminal output

---

## Standard Structure — `FilesystemRepository`

`FilesystemRepository` is the reference implementation. Every public method follows the same three-part shape: `try` → `ok(result)`, `catch` → `fail(code, message, err)`.

The class receives `rootDir` in its constructor and resolves all relative paths against it. Operations that need to reach outside the project root (e.g., temp directories for Claude) use the `*Absolute` method variants which skip `this.resolve()`.

```typescript
// src/repositories/filesystem.repository.ts

export class FilesystemRepository {
  constructor(private readonly rootDir: string) {} // rootDir is process.cwd() in production

  // Exposes rootDir for consumers that need to build absolute paths
  get root(): string { return this.rootDir; }

  // All relative-path methods go through resolve() — never concatenate strings
  resolve(...segments: string[]): string {
    return resolve(this.rootDir, ...segments);
  }

  // Standard pattern: try/ok, catch/fail
  async readText(path: string): Promise<Result<string>> {
    try {
      const content = await readFile(this.resolve(path), 'utf-8');
      return ok(content);         // wrap success
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to read ${path}`, err); // wrap failure
    }
  }

  // Void successes use ok(undefined) — never ok(null) or bare ok()
  async writeText(path: string, content: string): Promise<Result<void>> {
    try {
      await writeFile(this.resolve(path), content, 'utf-8');
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to write ${path}`, err);
    }
  }

  // Existence checks return boolean — NOT Result<boolean>.
  // Absence is a valid answer, not a failure.
  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolve(path));
      return true;
    } catch { return false; }
  }

  // Sync variant for startup checks — rare, prefer async
  existsSync(path: string): boolean {
    return existsSync(this.resolve(path));
  }

  // Absolute variants bypass rootDir resolution — for paths outside the project
  async copyAbsolute(absSrc: string, absDest: string): Promise<Result<void>> {
    try {
      await cp(absSrc, absDest, { recursive: true });
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to copy ${absSrc} to ${absDest}`, err);
    }
  }
}
```

**Takeaways**: The method signature always declares `Promise<Result<T>>` or `Promise<boolean>` — never a union. All paths flow through `this.resolve()` unless using an `*Absolute` variant. The error message includes the path so callers get actionable context without digging into `cause`.

---

## Domain Repositories — `FeatureRepository`

Domain repositories build on `FilesystemRepository` and return typed domain objects. They receive `FilesystemRepository` in their constructor — they do not create or own filesystem access themselves.

```typescript
// src/repositories/feature.repository.ts

export class FeatureRepository {
  constructor(private readonly fs: FilesystemRepository) {} // injected, never new'd internally

  async findAll(): Promise<Result<Feature[]>> {
    const listResult = await this.fs.listDir('.features');
    if (!listResult.ok) {
      return ok([]); // graceful degradation — missing .features dir = no features, not an error
    }

    const features: Feature[] = [];

    for (const entry of listResult.value) {
      if (!entry.startsWith('features-')) continue; // only process feature directories

      // Check both current and legacy KB paths for backward compatibility
      const kbPath = join('.features', entry, 'kb', 'KNOWLEDGE.md');
      const legacyKbPath = join('.features', entry, 'knowledge', 'KNOWLEDGE.md');
      const kbExists = await this.fs.exists(kbPath);
      const legacyKbExists = !kbExists && await this.fs.exists(legacyKbPath);
      if (!kbExists && !legacyKbExists) continue; // skip dirs without a KB

      features.push({
        name: toFeatureName(entry),            // branded type — no raw string here
        kbPath: kbExists ? kbPath : legacyKbPath,
        skillPath: join('.features', entry, 'skill', 'SKILL.md'),
        hasSkill: await this.fs.exists(skillPath),
      });
    }

    return ok(features.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async findByName(name: FeatureName): Promise<Result<Feature>> {
    const featuresResult = await this.findAll();
    if (!featuresResult.ok) return featuresResult; // propagate failure unchanged

    const found = featuresResult.value.find((f) => f.name === name);
    if (!found) {
      return fail('FEATURE_NOT_FOUND', `Feature "${name}" not found`); // typed domain error
    }

    return ok(found);
  }

  // Thin delegation — repositories compose, not reimplementing I/O
  async readKB(feature: Feature): Promise<Result<string>> {
    return this.fs.readText(feature.kbPath);
  }
}
```

**Takeaways**: `findAll()` returns `ok([])` when `.features` doesn't exist — the empty directory is not an error at the domain level. `findByName()` uses `FEATURE_NOT_FOUND`, a domain-specific error code, rather than the generic `FILESYSTEM_ERROR`. `readKB()` delegates directly — domain repositories are composing infrastructure, not reimplementing it.

---

## Dependency Patterns

**Conventions**

All wiring is manual in `src/index.ts`. There is no DI container or decorator-based injection. The instantiation order matches the dependency graph:

```typescript
// src/index.ts — the single composition root

// Infrastructure first
const fs = new FilesystemRepository(process.cwd()); // rootDir = current working directory

// Domain repositories receive infrastructure
const featureRepo = new FeatureRepository(fs);

// Clients are stateless and receive no constructor args
const claudeClient = new ClaudeClient();
const gitClient = new GitClient();

// Services receive repositories and/or clients
const featureService = new FeatureService(featureRepo, claudeClient);
const kbService = new KBService(fs, claudeClient);      // some services take FilesystemRepository directly
const deployService = new DeployService(fs);

// Commands receive fully-built services
const runCommand = makeRunCommand({ featureService });
```

**Insights**

- Services that manage files directly (e.g., `KBService`, `DeployService`) receive `FilesystemRepository` directly — they don't go through `FeatureRepository`
- `FilesystemRepository` is instantiated once and shared across all services — it holds no mutable state, so sharing is safe
- `rootDir` is always `process.cwd()` in production; tests would substitute a temp directory

---

## Error Handling

**Conventions**

| Scenario | Return type | Code used |
|---|---|---|
| Filesystem operation fails | `fail('FILESYSTEM_ERROR', ...)` | `FILESYSTEM_ERROR` |
| Domain entity not found | `fail('FEATURE_NOT_FOUND', ...)` | `FEATURE_NOT_FOUND` |
| File/directory does not exist (boolean check) | `false` (not a Result) | n/a |
| Success with no payload | `ok(undefined)` | n/a |

**Patterns**

The error pass-through idiom is used whenever a repository method calls another:

```typescript
// Pattern: check ok, return the failure unchanged if not
const listResult = await this.fs.listDir('.features');
if (!listResult.ok) return ok([]); // domain choice: treat as empty, not error
//                         ↑ sometimes the correct choice is to degrade gracefully

const featuresResult = await this.findAll();
if (!featuresResult.ok) return featuresResult; // other times, pass the failure up
```

The choice between `return ok([])` and `return featuresResult` is a domain decision: a missing `.features` directory means "no features yet" (graceful), but a failure inside `findAll()` propagating to `findByName()` should surface as a real error.

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| File | `<domain>.repository.ts` | `filesystem.repository.ts`, `feature.repository.ts` |
| Class | `<Domain>Repository` | `FilesystemRepository`, `FeatureRepository` |
| Methods (read) | `read*`, `find*`, `list*` | `readText`, `findAll`, `findByName`, `listDir` |
| Methods (write) | `write*`, `ensure*`, `copy*`, `remove*` | `writeText`, `ensureDir`, `copy`, `remove` |
| Methods (check) | `exists`, `isDirectory`, `existsSync` | returns `boolean` |
| Absolute-path variants | `*Absolute` suffix | `copyAbsolute`, `copyFileAbsolute`, `removeAbsolute` |

---

## Anti-Patterns

- **Throwing instead of returning `fail()`** — the call chain uses `if (!result.ok)` guards; a thrown error bypasses them entirely and surfaces as an unhandled rejection
- **Putting business logic in repositories** — `FeatureRepository` only reads and assembles `Feature` objects; decisions about what to do with them belong in services
- **New-ing `FilesystemRepository` inside a repository** — always inject it via the constructor; creating it internally ties the constructor to a specific `rootDir` and makes wiring impossible
- **Using relative paths when the target is outside `rootDir`** — `this.resolve()` always anchors to the project root; use an `*Absolute` method when working with OS temp directories or installed paths
- **Returning `Result<boolean>` for existence checks** — absence is not a failure; `exists()` and `isDirectory()` return plain `boolean`, keeping callers simple

---

## Gotchas and Edge Cases

- **`findByName()` is O(n)** — it calls `findAll()` internally and scans the resulting list. This is fine for the current scale (a handful of features), but it re-stats every feature's files on every call.
- **Legacy KB path support** — `FeatureRepository.findAll()` checks both `kb/KNOWLEDGE.md` (current) and `knowledge/KNOWLEDGE.md` (legacy). Any new code writing knowledge files must use the `kb/` subdirectory; the legacy check exists only for reading.
- **`ok(undefined)` not `ok(null)`** — void successes use `ok(undefined)`. Using `ok(null)` changes the inferred type to `Result<null>` and breaks call sites that expect `Result<void>`.
- **`existsSync` is a fallback** — it exists for cases where async isn't available (e.g., top-level startup checks). Prefer `exists()` in all async contexts.
- **`FilesystemRepository.root`** — the `root` getter exposes `rootDir` as a string. Services use it to construct absolute paths for operations like `copyFileAbsolute(KB_PROMPT_PATH, this.fs.resolve(...))`. Don't bypass it by hardcoding `process.cwd()` in a service.

---

## Related

- `src/repositories/filesystem.repository.ts` — full implementation; reference for new repositories
- `src/repositories/feature.repository.ts` — domain repository reference; shows graceful degradation vs. typed errors
- `src/index.ts` — the composition root; all repository instantiation and wiring lives here
- `src/types/index.ts` — `Result<T>`, `ok`, `fail`, `Feature`, `FeatureName` — imported by all repositories
- `.features/features-type-system/kb/KNOWLEDGE.md` — deep coverage of `Result<T>`, `ErrorCode`, and branded types that repositories depend on
