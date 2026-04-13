---
description: "Use when adding new types, extending error handling, creating new services or repositories, working with the Result pattern, or understanding branded types and discriminated unions. Keywords: types, Result, FeatureName, branded types, discriminated union, ErrorCode, type guards, readonly, AppError, ClaudeModel."
category: conventions
---

# Type System

## Overview

This project uses a disciplined TypeScript type system built around four core ideas: railway-oriented error handling via `Result<T>`, branded types for domain-safe strings, discriminated unions for message/event parsing, and deep immutability via `readonly`. All type definitions live under `src/types/` and are re-exported through a single barrel at `src/types/index.ts`.

Understanding these patterns is required before writing any service, repository, or client code — they determine how errors propagate, how strings are validated, and how runtime data from external sources (like the Claude CLI's JSON stream) is safely narrowed.

## Code Organization Principles

- **All shared types live in `src/types/`** — one file per domain area (`results.ts`, `features.ts`, `claude.ts`, `config.ts`), all re-exported through `src/types/index.ts`
- **Consumers import from `../types/index.js`** — never directly from sub-files. This preserves the barrel as the single source of truth.
- **Type-only imports use `import type`** — values (`ok`, `fail`, `isClaudeStreamEvent`) are imported normally; interfaces and type aliases are `import type`

## Standard Patterns

### Result<T> — the error handling backbone

**Why this exists**: The project avoids thrown exceptions entirely. Every async operation that can fail returns `Result<T>`, a discriminated union of `Success<T>` (`.ok === true`) and `Failure` (`.ok === false`). This forces callers to handle failure at every boundary without relying on `try/catch` control flow.

The `Result` type, its constructors, and the error vocabulary are defined in `src/types/results.ts`:

```typescript
// src/types/results.ts

// All possible failure modes — extend here when adding new error categories
export type ErrorCode =
  | 'CLAUDE_NOT_FOUND' | 'CLAUDE_FAILED'
  | 'FEATURE_NOT_FOUND' | 'KB_NOT_FOUND' | 'SKILL_NOT_FOUND'
  | 'GIT_FAILED' | 'FILESYSTEM_ERROR' | 'EDITOR_FAILED' | 'CANCELLED';

export interface AppError {
  readonly code: ErrorCode;    // machine-readable; used for programmatic handling
  readonly message: string;    // human-readable; shown in UI
  readonly cause?: unknown;    // original error for debugging / chaining
}

// Discriminated on the `ok` property
export interface Success<T> { readonly ok: true;  readonly value: T; }
export interface Failure<E = AppError> { readonly ok: false; readonly error: E; }

export type Result<T, E = AppError> = Success<T> | Failure<E>;

// Factory functions — always use these instead of constructing objects directly
export function ok<T>(value: T): Success<T> { return { ok: true, value }; }
export function fail(code: ErrorCode, message: string, cause?: unknown): Failure {
  return { ok: false, error: { code, message, cause } };
}
```

**Takeaways**: The discriminant is `.ok`, not `.success` or `.type`. Every service method and repository method returns `Promise<Result<T>>`. Use `ok(undefined)` to signal a successful void operation.

**The early-return propagation idiom** — the project's most common pattern:

```typescript
// src/services/kb.service.ts — early-return chains through multiple async steps
async createKB(featureName: FeatureName, topic: string, model: ClaudeModel): Promise<Result<string>> {
  const ensureResult = await this.fs.ensureDir(kbDir);
  if (!ensureResult.ok) return ensureResult; // propagates Failure up unchanged

  const copyResult = await this.fs.copyFileAbsolute(KB_PROMPT_PATH, localPromptPath);
  if (!copyResult.ok) return fail('FILESYSTEM_ERROR', 'Failed to copy KB prompt template');
  //                              ↑ re-wraps with a more contextual message when needed

  const claudeResult = await this.claudeClient.execute({ ... });
  if (!claudeResult.ok) return claudeResult; // pass-through when message is already correct

  return ok(kbFilePath); // only reached if all steps succeeded
}
```

**Takeaways**: `if (!result.ok) return result` is the standard error pass-through. Re-wrap with `fail()` only when the higher-level context adds useful information to the message.

---

### Branded Types — `FeatureName`

**Why this exists**: Feature names follow a strict naming convention (`features-<name>`) and are passed through many layers. A branded type ensures the normalization step (`toFeatureName()`) cannot be skipped — raw `string`s will not compile where `FeatureName` is expected.

```typescript
// src/types/features.ts

declare const featureNameBrand: unique symbol; // never exists at runtime; brand only

// FeatureName is a string at runtime — zero overhead — but typed distinctly at compile time
export type FeatureName = string & { readonly [featureNameBrand]: true };

// The only way to obtain a FeatureName — applies the "features-" prefix normalization
export function toFeatureName(raw: string): FeatureName {
  const normalized = raw.startsWith('features-') ? raw : `features-${raw}`;
  return normalized as FeatureName; // safe: we just normalized it
}

// Strip the prefix back to human-readable form for display
export function stripFeaturePrefix(name: FeatureName): string {
  return (name as string).replace(/^features-/, '');
}
```

**Takeaways**: Call `toFeatureName()` once at the CLI input boundary (in command handlers), then pass `FeatureName` through services and repositories without re-normalizing. Never cast a raw `string` to `FeatureName` except inside `toFeatureName()`.

---

### Discriminated Unions — Claude stream events

**Why this exists**: The Claude CLI emits newline-delimited JSON with heterogeneous shapes. Discriminated unions on the `type` property let TypeScript narrow these to their specific shapes inside `if`/`switch` branches without unsafe `as` casts.

```typescript
// src/types/claude.ts

// Content blocks inside an assistant message
export interface TextBlock    { readonly type: 'text';     readonly text: string; }
export interface ToolUseBlock { readonly type: 'tool_use'; readonly name: string; readonly input: Record<string, unknown>; }
export type ContentBlock = TextBlock | ToolUseBlock;

// Top-level stream events
export interface AssistantStreamEvent {
  readonly type: 'assistant';
  readonly message: { readonly content: ContentBlock[] };
}
export interface ResultStreamEvent {
  readonly type: 'result';
  readonly is_error: boolean;
  readonly result?: string;
  readonly duration_ms?: number;
  readonly num_turns?: number;
}
export type ClaudeStreamEvent = AssistantStreamEvent | ResultStreamEvent;

// Type guard used before accessing typed fields on unknown JSON
export function isClaudeStreamEvent(value: unknown): value is ClaudeStreamEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.type === 'assistant' || obj.type === 'result';
}
```

These are consumed in `src/clients/claude.client.ts` after parsing a raw JSON line:

```typescript
// src/clients/claude.client.ts — guard then switch-style narrowing
const parsed: unknown = JSON.parse(line);
if (isClaudeStreamEvent(parsed)) {
  // TypeScript now knows `parsed` is AssistantStreamEvent | ResultStreamEvent
  activeSpinner = handleStreamEvent(parsed, activeSpinner);
}

// Inside handleStreamEvent — TypeScript narrows on .type
function handleStreamEvent(event: ClaudeStreamEvent, ...): Ora | null {
  if (event.type === 'assistant') {
    // event is AssistantStreamEvent — .message.content is available
    for (const block of event.message.content) {
      if (block.type === 'text') { /* TextBlock */ }
      if (block.type === 'tool_use') { /* ToolUseBlock */ }
    }
  }
  if (event.type === 'result') {
    // event is ResultStreamEvent — .is_error, .duration_ms, .num_turns available
  }
}
```

**Takeaways**: Every discriminated union should have a type guard that validates `unknown` → `Union` for untrusted sources (parsed JSON, CLI output). Inside handlers, narrow further using `if (x.type === '...')` — TypeScript's control flow analysis makes this exhaustive.

---

### Const Assertions — `ClaudeModel`

**Why this exists**: The project uses `as const` to derive a literal union type from the single authoritative array of valid model names. This prevents adding a model string in one place but forgetting to update the type elsewhere.

```typescript
// src/types/config.ts

export const CLAUDE_MODELS = ['sonnet', 'opus', 'haiku'] as const;
// TypeScript infers: readonly ['sonnet', 'opus', 'haiku']

export type ClaudeModel = (typeof CLAUDE_MODELS)[number];
// TypeScript expands: 'sonnet' | 'opus' | 'haiku'

// Type guard for validating user-supplied strings
export function isClaudeModel(value: string): value is ClaudeModel {
  return (CLAUDE_MODELS as readonly string[]).includes(value);
}

// Resolves a raw string input to ClaudeModel with fallback
export function resolveModel(raw: string | undefined, fallback: ClaudeModel): ClaudeModel {
  if (!raw) return fallback;
  if (isClaudeModel(raw)) return raw; // narrowed to ClaudeModel inside this branch
  return raw as ClaudeModel;          // last-resort cast for passthrough (e.g. model aliases)
}
```

**Takeaways**: When a new Claude model becomes available, add it to `CLAUDE_MODELS`. The `ClaudeModel` type updates automatically — no separate union to edit. The `as const` cast is required; without it the array is `string[]` and index access returns `string`.

---

### Deep Immutability

**Why this exists**: All interface properties are `readonly` across the entire type system. Paired with `strict: true`, this prevents accidental mutation of domain objects and makes data flow predictable.

Every interface in `src/types/` follows this convention:

```typescript
// No mutable properties anywhere in the public API
export interface Feature {
  readonly name: FeatureName;
  readonly kbPath: string;
  readonly skillPath: string;
  readonly hasSkill: boolean;
}

export interface AppError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}
```

Service class dependencies follow the same pattern — `private readonly` in constructors:

```typescript
// src/services/kb.service.ts
export class KBService {
  constructor(
    private readonly fs: FilesystemRepository,   // injected, never reassigned
    private readonly claudeClient: ClaudeClient, // injected, never reassigned
  ) {}
}
```

**Takeaways**: Always add `readonly` to new interface properties. Always use `private readonly` for constructor-injected dependencies. Mutable local variables inside function bodies are fine; the rule applies to shared structures.

---

### Error Normalization — `toAppError()`

**Why this exists**: Repository methods wrap `try/catch` blocks around Node.js `fs` calls and need to convert the unknown caught value into a typed `AppError`. `toAppError()` in `src/lib/errors.ts` handles all three shapes (Error instance, string, unknown):

```typescript
// src/lib/errors.ts
export function toAppError(err: unknown, code: ErrorCode = 'FILESYSTEM_ERROR'): AppError {
  if (err instanceof Error) return { code, message: err.message, cause: err };
  if (typeof err === 'string') return { code, message: err };
  return { code, message: 'Unknown error', cause: err };
}

// Also exports: isCancelled() — checks for @clack/prompts cancellation symbol
export function isCancelled(value: unknown): value is symbol {
  return typeof value === 'symbol' || isCancel(value);
}
```

**Takeaways**: When wrapping a `try/catch` in a repository or client, prefer `fail(code, message, err)` for simple cases where you already have the message. Use `toAppError()` when you want to re-use the original `Error.message` and preserve the cause chain.

## Error Handling Standards

The pattern is: **catch at the boundary, propagate via Result, display at the command layer**.

- **Clients and repositories** wrap `try/catch` and return `fail(...)` — they never throw
- **Services** chain results with early returns — they never catch, they propagate
- **Commands** are the only layer that calls `process.exit` or renders error messages to the terminal
- **`CANCELLED`** is a special `ErrorCode` for user-interruption (Ctrl-C via `@clack/prompts`); commands check for it before showing an error message

```typescript
// Pattern: check for cancel before reporting an error
const result = await someService.doThing();
if (!result.ok) {
  if (result.error.code === 'CANCELLED') return; // silent exit
  showError(result.error.message);               // render to UI
  process.exit(1);
}
```

## Anti-Patterns

- **Throwing instead of returning `fail()`** — breaks the Result chain; callers that `if (!result.ok)` will never see the error
- **Casting `string` to `FeatureName` outside `toFeatureName()`** — defeats the branding guarantee; always go through the constructor
- **Importing types directly from sub-files** (`../types/results.js`) instead of `../types/index.js` — fragments the import graph; always use the barrel
- **Mutable interface properties** — omitting `readonly` on new interface fields; strict mode doesn't enforce this automatically unless you add `readonly` explicitly
- **Catching errors in service methods** — services should propagate failures up as Result values, not swallow them; only clients and repositories catch

## Gotchas and Edge Cases

- `ok(undefined)` is the correct way to return a successful `Result<void>` — returning `ok(null)` changes the type signature
- `isClaudeModel()` returns `false` for an unrecognized string; `resolveModel()` falls through to a cast for passthrough scenarios (e.g. a full model alias not in the array). Be careful: the cast removes the compile-time guarantee
- `FeatureName` is a `string` at runtime — `console.log(featureName)` prints the string directly; no `.value` property exists
- Temp files in `ClaudeClient` are named with `Date.now()` for uniqueness; if multiple executions run concurrently (not currently the case but possible) a random suffix should be added
- `ErrorCode` is a closed literal union — adding a new error category requires editing `src/types/results.ts`. If you skip this step, TypeScript will reject `fail('YOUR_NEW_CODE', ...)` with a type error

## Related

- `src/types/results.ts` — Result type, ErrorCode, AppError, ok/fail constructors
- `src/types/features.ts` — FeatureName branded type, Feature interface
- `src/types/claude.ts` — ClaudeStreamEvent discriminated union, ContentBlock, isClaudeStreamEvent
- `src/types/config.ts` — ClaudeModel const assertion, isClaudeModel, resolveModel
- `src/types/index.ts` — barrel re-export (the only import path consumers should use)
- `src/lib/errors.ts` — toAppError, isCancelled
- `src/repositories/filesystem.repository.ts` — reference implementation of Result-based error wrapping
- `src/clients/claude.client.ts` — reference implementation of type guard usage on unknown JSON
- `.features/features-repository-layer/kb/KNOWLEDGE.md` — how the Result pattern is applied in the repository layer specifically
