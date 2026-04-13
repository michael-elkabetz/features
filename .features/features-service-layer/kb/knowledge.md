---
description: "Use when adding a new service, extending an existing service, calling a service from a command, understanding how services interact with repositories and clients, or tracing how errors flow through the system. Keywords: service, business logic, Result, ok, fail, dependency injection, wiring, AppError."
category: component-patterns
---

# Service Layer

## Overview

Services are the business logic tier in this project's four-layer architecture: Commands → Services → Repositories/Clients. Each service is a standalone class wired once at startup in `src/index.ts` and never imported directly by other services. They coordinate repositories (data access) and clients (external processes) to implement domain operations like executing a feature, building a knowledge base, or deploying a skill.

The defining constraint of this layer is that every non-trivial method returns `Promise<Result<T>>` — the project's error-as-value type. Services never throw. They consume errors from the layers below, short-circuit on failure, and pass results up to commands which are the only layer that renders errors to the user.

## Core Responsibilities

**Services SHOULD:**
- Orchestrate multi-step operations (prepare dirs → copy templates → invoke Claude → verify output)
- Construct prompts and user messages passed to `ClaudeClient`
- Validate postconditions after client calls (e.g., check that a file was actually written)
- Return `Promise<Result<T>>` for all async operations that can fail
- Define their own options interfaces for complex parameter groups

**Services SHOULD NOT:**
- Import from `src/ui/` or call `showError()` — that belongs to commands
- Instantiate their own dependencies — all deps come in via constructor
- Import other services — services are peers, not a hierarchy
- Throw exceptions — wrap all errors in `fail(code, message)`

## Standard Structure

Every service follows the same shape: typed constructor params, no base class, async methods returning `Result<T>`.

The constructor receives dependencies as typed private readonly fields. There are no optional deps or default values — every service declares exactly what it needs.

```typescript
// src/services/deploy.service.ts — the simplest service, good reference shape
import type { Result, FeatureName } from '../types/index.js';
import { ok } from '../types/index.js';                     // ok() and fail() are how you build Result values
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';

export interface DeployResult {           // Define a result shape when returning structured data
  readonly deployedPaths: string[];
}

export class DeployService {
  constructor(private readonly fs: FilesystemRepository) {} // Dependencies injected, not imported

  async deploy(
    featureName: FeatureName,            // Use domain types (FeatureName, ClaudeModel) not raw strings
    skillSourceDir: string,
  ): Promise<Result<DeployResult>> {    // Promise<Result<T>> — the standard signature
    const deployedPaths: string[] = [];

    for (const dest of destinations) {
      const ensureResult = await this.fs.ensureDir(dest);
      if (!ensureResult.ok) return ensureResult; // Fail-fast: return the error immediately, no transformation
      deployedPaths.push(dest);
    }

    return ok({ deployedPaths });        // Wrap success value in ok()
  }
}
```

**Key takeaways:** No base class. No constructor logic beyond field assignment. Every method that can fail returns `Promise<Result<T>>`. `ok()` and `fail()` from `src/types/index.js` are the only way to build return values.

## Error Handling

### The Result Type

`Result<T>` is a discriminated union defined in `src/types/results.ts`:

```typescript
type Result<T, E = AppError> = Success<T> | Failure<E>;

interface Success<T> { readonly ok: true;  readonly value: T; }
interface Failure<E>  { readonly ok: false; readonly error: E; }

interface AppError {
  readonly code: ErrorCode;   // One of the string literal union values below
  readonly message: string;
  readonly cause?: unknown;   // Original error for debugging
}
```

Available `ErrorCode` values (all defined in `src/types/results.ts`):

| Code | When to use |
|---|---|
| `'CLAUDE_FAILED'` | Claude process ran but exited non-zero |
| `'CLAUDE_NOT_FOUND'` | Claude binary not on PATH |
| `'FEATURE_NOT_FOUND'` | Feature directory doesn't exist |
| `'KB_NOT_FOUND'` | Knowledge file missing after Claude ran |
| `'SKILL_NOT_FOUND'` | Skill file missing |
| `'GIT_FAILED'` | Git clone or sparse-checkout failed |
| `'FILESYSTEM_ERROR'` | Any fs/promises error |
| `'EDITOR_FAILED'` | Editor spawn failed |
| `'CANCELLED'` | User cancelled a prompt |

### Fail-Fast Propagation

The pattern is always: check `result.ok`, and if false, return it immediately. Never collect errors.

```typescript
// From KBService.createKB() — a multi-step method showing the chain
async createKB(featureName: FeatureName, topic: string, model: ClaudeModel): Promise<Result<string>> {
  // Step 1: prepare dir — fail immediately if it fails
  const ensureResult = await this.fs.ensureDir(kbDir);
  if (!ensureResult.ok) return ensureResult;          // Propagate as-is; don't wrap or rethrow

  // Step 2: copy template — use a new fail() when the error needs a specific code
  const copyResult = await this.fs.copyFileAbsolute(KB_PROMPT_PATH, localPromptPath);
  if (!copyResult.ok) return fail('FILESYSTEM_ERROR', 'Failed to copy KB prompt template');

  // Step 3: invoke Claude
  const claudeResult = await this.claudeClient.execute({ ... });
  if (!claudeResult.ok) return claudeResult;

  // Step 4: check the client's exit code — ClaudeClient.execute() returning ok doesn't mean success
  if (claudeResult.value.exitCode !== 0) {
    return fail('CLAUDE_FAILED', `Claude exited with code ${claudeResult.value.exitCode}`);
  }

  // Step 5: verify postcondition — don't assume Claude wrote the file
  const kbExists = await this.fs.exists(kbFilePath);
  if (!kbExists) {
    return fail('KB_NOT_FOUND', 'KB was not created by Claude');
  }

  return ok(kbFilePath);  // Return the path as the success value
}
```

**Key takeaways:** Return errors as-is with `return result` when the code and message are already correct. Use `return fail(code, msg)` to set a specific error code. Always check `exitCode` after a Claude call — a process completing is not the same as it succeeding. Always verify postconditions after Claude writes files.

### Boolean Checks Are Not Results

`FilesystemRepository.exists()` and `isDirectory()` return raw `Promise<boolean>`, not `Result<boolean>`. Use them for existence guards, not error paths:

```typescript
// Correct — existence check is a conditional, not an error
const kbExists = await this.fs.exists(kbFilePath);
if (!kbExists) {
  return fail('KB_NOT_FOUND', 'KB was not created by Claude');
}

// Also correct — synchronous variant for "already installed" guards
if (this.fs.existsSync(installPath)) {
  return ok(undefined);  // Early exit, not an error
}
```

## Service-Repository Interaction Patterns

### Pattern 1: Simple Read & Use

When a method just needs to fetch something and pass it downstream:

```typescript
// FeatureService.executeFeature() — read KB content, inject into prompt
const kbResult = await this.featureRepo.readKB(feature);
if (!kbResult.ok) return kbResult;                    // Short-circuit on missing KB

const appendPrompt = [
  '# Feature KB — MANDATORY CONTEXT',
  // ...
  kbResult.value,                                     // Unwrap .value only after .ok check
].join('\n');
```

### Pattern 2: Prepare → Execute → Verify

When a method drives Claude to produce a file artifact:

1. `ensureDir()` — create destination directory
2. Copy any template/prompt file the subprocess needs
3. `claudeClient.execute()` — run the process
4. Check `exitCode !== 0`
5. `fs.exists()` — verify the expected artifact was created
6. `return ok(filePath)` — return the artifact path as proof of success

### Pattern 3: Fallback with Cleanup

`SkillService.ensureSkillCreator()` shows the try/finally pattern for temp directory cleanup:

```typescript
const tmpDir = join(tmpdir(), `features-skill-creator-${Date.now()}`);
try {
  const sparseResult = await this.gitClient.sparseClone(SKILL_CREATOR_REPO, SKILL_CREATOR_SUBPATH, tmpDir);

  if (!sparseResult.ok) {
    await this.fs.removeAbsolute(tmpDir);             // Clean partial state before retrying
    const shallowResult = await this.gitClient.shallowClone(SKILL_CREATOR_REPO, tmpDir);
    if (!shallowResult.ok) return shallowResult;      // Both strategies failed — give up
  }
  // ...copy from tmpDir...
  return ok(undefined);
} finally {
  await this.fs.removeAbsolute(tmpDir);              // Always clean up, success or failure
}
```

**Key takeaway:** `finally` is the right place for temp dir cleanup — it runs whether the try block returns `ok` or `fail`. Cleanup errors in `finally` are silently ignored (removeAbsolute uses `force: true`).

## Prompt Building Pattern

Services that use `ClaudeClient` build prompts as private module-scope functions — not methods:

```typescript
// Bottom of kb.service.ts — private to the module, not exported
function buildKBUpdatePrompt(kbPath: string): string {
  return [
    `Investigate the current state of the codebase and update the KB at ${kbPath}.`,
    '',
    'Instructions:',
    `1. Read the existing KB at ${kbPath} to understand what it currently covers.`,
    // ...numbered steps...
  ].join('\n');
}

// Called from the service method:
async updateKB(feature: Feature, model: ClaudeModel): Promise<Result<void>> {
  const userPrompt = buildKBUpdatePrompt(feature.kbPath);
  const result = await this.claudeClient.execute({ userPrompt, model, print: true });
  // ...
}
```

**Key takeaway:** Keep prompt strings out of method bodies. Module-scope functions keep the method clean and make the prompt easy to read and update. These are private to the module — don't export them.

## Dependency Wiring

All services are instantiated once in `src/index.ts` — the single composition root. The wiring order follows the dependency graph:

```typescript
// src/index.ts — read this file to understand the full dependency graph

// 1. Leaf tier — no dependencies
const fs = new FilesystemRepository(process.cwd()); // rootDir set once here
const claudeClient = new ClaudeClient();
const gitClient = new GitClient();
const editorClient = new EditorClient();

// 2. Repository tier — depends on FilesystemRepository
const featureRepo = new FeatureRepository(fs);

// 3. Service tier — depends on repositories and/or clients
const featureService = new FeatureService(featureRepo, claudeClient);
const kbService = new KBService(fs, claudeClient);
const skillService = new SkillService(fs, claudeClient, gitClient);
const deployService = new DeployService(fs);

// 4. Command tier — depends on services, built via factory functions
const createCommand = makeCreateCommand({ kbService, skillService, deployService, editorClient });
```

Commands receive a typed deps object (e.g., `CreateDeps`) — not individual service arguments. This pattern makes adding a new dependency to a command a localized change: update the `Deps` interface and the call site in `index.ts`.

## Anti-Patterns

- **Importing services into other services** — services are peers. If two services share logic, extract it to `src/lib/`.
- **Throwing instead of returning `fail()`** — caught exceptions propagate opaquely; `Result` makes failure explicit. The `toAppError()` utility in `src/lib/errors.ts` converts caught exceptions when needed.
- **Calling `showError()` from a service** — services don't know the UI exists. Error display belongs to commands.
- **Assuming Claude succeeded because `execute()` returned `ok`** — always check `result.value.exitCode`. A process that exits with code 1 is still a successful process execution from the client's perspective.
- **Assuming Claude wrote the file** — verify with `fs.exists()` after any Claude call that's supposed to create a file.
- **Adding services to `src/types/index.ts`** — types only. Service classes live in `src/services/`.

## Gotchas and Edge Cases

- **`FilesystemRepository.exists()` returns `boolean`, not `Result<boolean>`** — don't try to check `.ok` on it.
- **`FilesystemRepository.resolve()` joins relative paths against `rootDir`** — if you have an absolute path, use the `*Absolute` method variants (`copyAbsolute`, `removeAbsolute`, `copyFileAbsolute`).
- **Temp dir names include `Date.now()`** — if two processes run simultaneously they'll get different paths. Don't assume the temp dir is unique across time; the `finally` block cleans it up.
- **`print: true` in ClaudeClient options** — KB and skill creation use `print: true` to run Claude in non-interactive mode. Feature execution does not — it uses `appendSystemPrompt` and runs interactively.
- **`SkillService.createSkill()` returns `Result<number>`** (the exit code) rather than `Result<void>` — the caller (`skill` command) uses the exit code to set the process exit.

## Related

- `src/types/results.ts` — `Result<T>`, `ok()`, `fail()`, `AppError`, `ErrorCode` definitions
- `src/repositories/filesystem.repository.ts` — all filesystem methods services call
- `src/repositories/feature.repository.ts` — feature discovery and KB loading
- `src/lib/errors.ts` — `toAppError()` and `isCancelled()` utilities
- `src/lib/config.ts` — all constants services reference (paths, URLs, install dirs)
- `src/index.ts` — composition root; where all services are instantiated and wired
- `.features/features-repository-layer/kb/knowledge.md` — repository layer patterns
- `.features/features-type-system/kb/knowledge.md` — type system including `Result<T>` and domain types
- `.features/features-claude-client/kb/knowledge.md` — ClaudeClient options, modes, and return values
