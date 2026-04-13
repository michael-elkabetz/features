---
name: features-repository-layer
description: >
  Add a new repository, extend FilesystemRepository, understand data access structure, wire dependencies,
  or read/write files in the features project. Use this skill whenever the task involves: creating a
  repository class, adding methods to FilesystemRepository or FeatureRepository, wiring a new repo in
  index.ts, working with Result<T>/ok/fail in a data-access context, resolving paths relative to rootDir,
  or understanding how the filesystem-based persistence layer works. Also triggers for questions about
  the repository pattern in this codebase, graceful degradation vs. typed errors, or the difference
  between FILESYSTEM_ERROR and domain error codes.
---

# Repository Layer Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-repository-layer/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Quick Reference (Embedded Knowledge)

> This section is a condensed summary. The full patterns, examples, and gotchas live in the knowledge file — read that first.

### Two repositories, one filesystem

| Class | File | Role |
|---|---|---|
| `FilesystemRepository` | `src/repositories/filesystem.repository.ts` | Wraps `fs/promises` behind `Result<T>` |
| `FeatureRepository` | `src/repositories/feature.repository.ts` | Domain layer; reads/lists `Feature` objects |

There is no database. All persistence is filesystem-based.

### Dependency direction (load-bearing)

```
Commands → Services → Repositories → fs/promises
```

Repositories **never** import from services, clients, commands, or UI. Violations break the architecture.

### Method return types at a glance

| Scenario | Return type | Example |
|---|---|---|
| Read/write/list success | `Promise<Result<T>>` | `Promise<Result<string>>` |
| Void write success | `ok(undefined)` | `writeText`, `ensureDir` |
| File/dir existence | `Promise<boolean>` | `exists()`, `isDirectory()` |
| Filesystem failure | `fail('FILESYSTEM_ERROR', msg, err)` | all `catch` blocks |
| Domain entity missing | `fail('FEATURE_NOT_FOUND', msg)` | `findByName` |

### The three-part method shape (FilesystemRepository)

```typescript
async someMethod(path: string): Promise<Result<SomeType>> {
  try {
    const result = await someNodeOperation(this.resolve(path));
    return ok(result);
  } catch (err) {
    return fail('FILESYSTEM_ERROR', `Failed to <verb> ${path}`, err);
  }
}
```

- Always `this.resolve(path)` for relative paths inside the project
- Always `*Absolute` variants for paths outside `rootDir` (e.g., OS temp dirs)
- Error message includes the path for actionable context

### Constructor injection rules

```typescript
// FilesystemRepository — takes rootDir
const fs = new FilesystemRepository(process.cwd());

// Domain repositories — injected, never new'd internally
export class FeatureRepository {
  constructor(private readonly fs: FilesystemRepository) {}
}
```

Never instantiate `FilesystemRepository` inside another repository. Always inject.

### Composition root (`src/index.ts`) wiring order

1. `FilesystemRepository` (infrastructure, first)
2. Domain repositories receive `FilesystemRepository`
3. Clients (stateless, no constructor args)
4. Services receive repositories and/or clients
5. Commands receive fully-built services

### Naming conventions

| Thing | Convention |
|---|---|
| File | `<domain>.repository.ts` |
| Class | `<Domain>Repository` |
| Read methods | `read*`, `find*`, `list*` |
| Write methods | `write*`, `ensure*`, `copy*`, `remove*` |
| Existence checks | `exists`, `isDirectory`, `existsSync` (return `boolean`) |
| Outside-rootDir methods | `*Absolute` suffix |

---

## Step-by-Step Instructions

### Adding a new method to `FilesystemRepository`

1. Read `src/repositories/filesystem.repository.ts` to understand existing methods.
2. Determine whether the path is inside the project root (use `this.resolve(path)`) or outside (use an `*Absolute` variant and accept an absolute path parameter).
3. Determine the return type:
   - If the operation can fail: `Promise<Result<T>>` — use the three-part try/ok/catch/fail shape.
   - If you're checking existence: return `Promise<boolean>` — NOT `Result<boolean>`.
   - Void write: return `Promise<Result<void>>` with `ok(undefined)` on success.
4. Name the method using the conventions table above.
5. The error message in `fail(...)` must include the path so callers have context.

### Creating a new domain repository

1. Read the knowledge file fully, then read `src/repositories/feature.repository.ts` for the reference pattern.
2. Create `src/repositories/<domain>.repository.ts`.
3. Constructor takes `FilesystemRepository` as its only dependency — injected, never `new`'d internally.
4. Use domain-specific error codes (e.g., `SKILL_NOT_FOUND`) for missing-entity failures — not the generic `FILESYSTEM_ERROR`. Check `src/types/index.ts` for existing `ErrorCode` values before adding new ones.
5. For "not found" graceful degradation (e.g., a missing directory means "empty list"): return `ok([])` rather than propagating the filesystem failure.
6. For failures that should surface to callers: propagate with `return result` — never swallow.
7. Thin delegation is correct: if the method just calls one `FilesystemRepository` method, a one-liner delegation is the right implementation.
8. After creating the class, wire it in `src/index.ts` (see wiring order above).

### Wiring a new repository in `src/index.ts`

1. Read `src/index.ts` to see existing wiring.
2. Instantiate after `FilesystemRepository`, before any service that needs it.
3. Pass it to every service that needs it — `FilesystemRepository` is shared (it's stateless), so reuse the existing `fs` instance.
4. Do NOT add a DI container or decorators — manual wiring only.

### Handling errors in repository methods

Follow these rules strictly:

- **Never throw** — always return `fail(...)`.
- **Never return `Result<boolean>`** — existence checks return plain `boolean`.
- **Propagate failures unchanged** when the caller has no recovery path: `if (!result.ok) return result;`
- **Degrade gracefully** only when absence is a valid domain state (e.g., `.features` dir not yet created → return `ok([])`).
- **Use domain error codes** for missing entities; use `FILESYSTEM_ERROR` for I/O failures.

### Checking what `ErrorCode` values are available

Read `src/types/index.ts` for the full list of `ErrorCode` values. If you need a new code, add it there following the existing pattern before using it in a repository.

---

## Key Gotchas

- `ok(undefined)` not `ok(null)` — void successes. Using `ok(null)` changes the inferred type to `Result<null>` and breaks callers.
- `findByName()` is O(n) — it calls `findAll()` internally. Fine at current scale; don't optimize prematurely, but be aware.
- Legacy KB path — `FeatureRepository.findAll()` checks both `kb/KNOWLEDGE.md` (current) and `knowledge/KNOWLEDGE.md` (legacy). New code must always write to `kb/`.
- `FilesystemRepository.root` getter exposes `rootDir`. Use it in services to build absolute paths — don't hardcode `process.cwd()` elsewhere.
- `existsSync` is a fallback for startup-time checks only. Prefer `exists()` everywhere else.

---

## Final Step: Knowledge Sync

After completing all changes above, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `.features/features-repository-layer/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new patterns introduced by your changes (e.g., new method variants, new domain repositories, new error codes)
   - Any conventions that changed as a result of your work
   - Any sections that no longer reflect reality — remove or correct them
   - New entries in "Related" or "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
