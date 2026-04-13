---
name: features-service-layer
description: >
  Add a new service, extend an existing service, call a service from a command, wire a service into
  the composition root, or understand how services interact with repositories and clients in the
  features project. Use this skill whenever the task involves: creating a service class, adding
  methods to a service, orchestrating multi-step operations using ClaudeClient or repositories,
  handling Result<T> error propagation, building prompts inside a service, or tracing how business
  logic flows between commands and the data layer. Keywords: service, business logic, Result, ok,
  fail, dependency injection, wiring, AppError, ClaudeClient, KBService, FeatureService,
  SkillService, DeployService.
---

# Service Layer

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-service-layer/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Quick Reference (read this, then go deeper in the knowledge file)

### Where things live

| What | Path |
|---|---|
| Service classes | `src/services/<name>.service.ts` |
| Composition root (wiring) | `src/index.ts` |
| Result type + error codes | `src/types/results.ts` |
| Filesystem repository | `src/repositories/filesystem.repository.ts` |
| Feature repository | `src/repositories/feature.repository.ts` |
| Shared lib utilities | `src/lib/errors.ts`, `src/lib/config.ts` |

### The Result<T> contract

Every async method that can fail returns `Promise<Result<T>>`. Services never throw.

```typescript
import type { Result } from '../types/index.js';
import { ok, fail } from '../types/index.js';

// Success
return ok(value);

// Failure — always use an ErrorCode from src/types/results.ts
return fail('FILESYSTEM_ERROR', 'Could not write output file');

// Propagate a failure from a lower layer as-is
if (!result.ok) return result;

// Propagate with a specific code override
if (!result.ok) return fail('KB_NOT_FOUND', 'KB was not created by Claude');
```

### Available ErrorCodes

`'CLAUDE_FAILED'` · `'CLAUDE_NOT_FOUND'` · `'FEATURE_NOT_FOUND'` · `'KB_NOT_FOUND'` · `'SKILL_NOT_FOUND'` · `'GIT_FAILED'` · `'FILESYSTEM_ERROR'` · `'EDITOR_FAILED'` · `'CANCELLED'`

### Minimal service shape

```typescript
// src/services/example.service.ts
import type { Result } from '../types/index.js';
import { ok, fail } from '../types/index.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';

export interface ExampleResult {
  readonly outputPath: string;
}

export class ExampleService {
  constructor(
    private readonly fs: FilesystemRepository,
    // ...other typed deps
  ) {}

  async doSomething(input: string): Promise<Result<ExampleResult>> {
    const ensureResult = await this.fs.ensureDir('/some/dir');
    if (!ensureResult.ok) return ensureResult;

    // ...steps...

    return ok({ outputPath: '/some/dir/output.txt' });
  }
}
```

---

## Step-by-Step: Adding a New Service

### 1. Create the service file

- File: `src/services/<name>.service.ts`
- No base class, no class inheritance
- Constructor receives all dependencies as typed `private readonly` fields — never instantiate deps inside the class
- Export an interface for each structured return value (e.g., `DeployResult`)

### 2. Implement methods using fail-fast Result chaining

Follow the **Prepare → Execute → Verify** pattern when orchestrating Claude:

1. `await this.fs.ensureDir(dir)` — create working directory; fail if it fails
2. Copy any template/prompt file the subprocess needs (`this.fs.copyFileAbsolute(...)`)
3. `await this.claudeClient.execute({ userPrompt, model, print: true })` — run Claude
4. **Check `exitCode !== 0`** — a process completing is NOT the same as succeeding
5. `await this.fs.exists(expectedFile)` — verify Claude produced the artifact (returns `boolean`, not `Result`)
6. `return ok(filePath)` — return the artifact path as proof of success

For temp directories, use `try/finally` to guarantee cleanup whether the method returns `ok` or `fail`.

### 3. Build prompts as module-scope functions

Keep prompt strings out of method bodies. Define them as unexported functions at the bottom of the service file:

```typescript
// Bottom of the file — private to the module, not exported
function buildMyPrompt(param: string): string {
  return [
    `Do the thing with ${param}.`,
    '',
    'Instructions:',
    '1. Step one',
    '2. Step two',
  ].join('\n');
}
```

### 4. Wire the service in `src/index.ts`

Read `src/index.ts` to see the existing instantiation order, then add your service in the correct tier:

```
Tier 1 (leaf): FilesystemRepository, ClaudeClient, GitClient, EditorClient
Tier 2 (repos): FeatureRepository(fs)
Tier 3 (services): your new service goes here
Tier 4 (commands): makeXxxCommand({ ...services, ...clients })
```

Pass the new service to any command that needs it via the command's `Deps` interface.

### 5. Update the command's Deps interface

If a command needs the new service, add it to the command's typed deps object (e.g., `CreateDeps` in `src/commands/create.ts`). Then update the `makeXxxCommand` call in `src/index.ts` to pass the service.

---

## Step-by-Step: Extending an Existing Service

1. Read the existing service file to understand current dependencies and method patterns
2. Add the new method following the same `Promise<Result<T>>` signature
3. If the method needs a new dependency, add it to the constructor and update `src/index.ts`
4. If the method produces a new artifact type, export a new result interface from the service file

---

## Key Rules (the "why" matters more than the rule itself)

**Never import a service from another service.** Services are peers, not a hierarchy. Shared logic belongs in `src/lib/`. If you find yourself wanting to call `kbService` from inside `skillService`, extract the shared code to a library function instead.

**Never call `showError()` or import from `src/ui/` inside a service.** Services are pure business logic and don't know the UI exists. The command layer is the only layer that renders errors to the user. This keeps services testable and reusable.

**Always check `exitCode` after `claudeClient.execute()`.**  `execute()` returning `ok` means the *process* ran without crashing — not that Claude completed the task successfully. A Claude process that exits with code 1 is still a "successful" process execution from the OS perspective.

**Verify file artifacts with `fs.exists()` after Claude calls.** Claude might fail silently, produce partial output, or write to a different path. Don't assume the file is there — check.

**`fs.exists()` returns `boolean`, not `Result<boolean>`.** Don't try to check `.ok` on it.

**Use `*Absolute` method variants for absolute paths.** `fs.resolve()` and plain variants join against `rootDir`. If you already have an absolute path, use `fs.copyFileAbsolute()`, `fs.removeAbsolute()`, etc.

---

## Common Gotchas

- `SkillService.createSkill()` returns `Result<number>` (exit code), not `Result<void>` — the caller uses it to set `process.exit()`
- `print: true` in ClaudeClient options = non-interactive mode (KB/skill creation). Feature execution runs interactively without `print: true`
- `Date.now()` in temp dir names: don't assume uniqueness across time — the `finally` cleanup handles it
- New `ErrorCode` values must be added to `src/types/results.ts` before you can use them

---

## Final Step: Knowledge Sync

After completing all changes, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `.features/features-service-layer/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new services or methods introduced
   - Any new patterns (e.g., new ClaudeClient option usage, new error codes)
   - Any sections that no longer reflect reality — remove or correct them
   - New entries in "Related" or "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
