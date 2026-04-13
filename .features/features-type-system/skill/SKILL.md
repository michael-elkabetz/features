---
name: type-system
description: >
  Guides adding new types, extending error handling, creating services/repositories, and working with the project's TypeScript type system. Use this skill whenever you are: adding a new ErrorCode or AppError, writing a new service or repository method, defining new interfaces or types, creating a branded type, adding a discriminated union, working with Result<T>, using ok/fail constructors, defining ClaudeModel-style const assertions, handling unknown JSON from external sources, or reviewing imports from src/types/. Also use when the user asks about type guards, readonly conventions, FeatureName, railway-oriented programming, or how errors propagate through the codebase.
---

# Type System Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-type-system/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Quick-Reference: Core Patterns

This is a condensed summary. The knowledge file has the full authoritative detail.

### File Layout
- All shared types → `src/types/` (one file per domain: `results.ts`, `features.ts`, `claude.ts`, `config.ts`)
- Barrel re-export → `src/types/index.ts` — **the only import path consumers use**
- Error helpers → `src/lib/errors.ts`
- Type-only symbols: `import type { ... }` — runtime values (`ok`, `fail`, `isClaudeStreamEvent`) use regular imports

### Result<T> — return, never throw
- Discriminant: `.ok` (true = Success, false = Failure)
- Constructors: `ok(value)` and `fail(code, message, cause?)`
- Void success: `ok(undefined)` — never `ok(null)`
- Services propagate with `if (!result.ok) return result`; re-wrap with `fail()` only when added context helps the caller
- Only clients/repositories catch; services never catch; commands are the only layer that calls `process.exit`

### ErrorCode
- Closed literal union in `src/types/results.ts` — add new codes there before using `fail('NEW_CODE', ...)`
- Special code: `'CANCELLED'` — check before showing an error in commands

### FeatureName (branded type)
- Entry point: `toFeatureName(raw)` — normalizes to `features-<name>`, apply once at the CLI boundary
- Never cast a raw `string` to `FeatureName` anywhere except inside `toFeatureName()`

### ClaudeStreamEvent (discriminated union)
- Use `isClaudeStreamEvent(parsed)` type guard on `unknown` JSON before accessing any typed fields
- Narrow inside handlers with `if (event.type === 'assistant')` / `if (event.type === 'result')`

### ClaudeModel (const assertion)
- Canonical array: `CLAUDE_MODELS` in `src/types/config.ts`
- To add a model: add it to `CLAUDE_MODELS`; `ClaudeModel` type updates automatically
- Validate user input with `isClaudeModel(value)`

### Immutability
- All interface properties: `readonly`
- All constructor-injected dependencies: `private readonly`
- Mutable local variables inside function bodies are fine

---

## Step-by-Step Guide

### Adding a new service or repository method

1. Read the knowledge file at `.features/features-type-system/kb/KNOWLEDGE.md` if you haven't already.
2. Import from `../types/index.js` (never sub-files directly).
3. Return `Promise<Result<T>>`. Define `T` as the specific success value type.
4. In repositories/clients: wrap `try/catch`, return `fail(code, message, err)`. Use `toAppError()` from `src/lib/errors.ts` if you want to preserve the original Error message as-is.
5. In services: chain with the early-return propagation idiom:
   ```typescript
   const stepResult = await this.dependency.method(arg);
   if (!stepResult.ok) return stepResult; // or re-wrap with fail() for more context
   ```
6. Never throw. Never catch inside a service method.

### Adding a new ErrorCode

1. Open `src/types/results.ts`.
2. Add your new literal to the `ErrorCode` union.
3. Now you can use `fail('YOUR_NEW_CODE', ...)` anywhere.

### Defining a new branded type

Follow the `FeatureName` template in `src/types/features.ts`:
```typescript
declare const myBrand: unique symbol;
export type MyBrandedType = string & { readonly [myBrand]: true };
export function toMyBrandedType(raw: string): MyBrandedType {
  // normalize / validate raw here
  return normalized as MyBrandedType;
}
```
Apply the constructor once at the input boundary; pass the branded type through all internal layers.

### Defining a new discriminated union

1. Give each member a `readonly type` literal property.
2. Write a type guard `isXxx(value: unknown): value is XxxUnion` that validates the discriminant on the `unknown` input.
3. In handlers, narrow further with `if (x.type === '...')` — TypeScript's control flow analysis makes the branches exhaustive.
4. Add all members and the type guard to the appropriate file in `src/types/`, then re-export through `src/types/index.ts`.

### Defining a new const-assertion enum

Follow the `ClaudeModel` template in `src/types/config.ts`:
```typescript
export const MY_VALUES = ['a', 'b', 'c'] as const;
export type MyType = (typeof MY_VALUES)[number];
export function isMyType(value: string): value is MyType {
  return (MY_VALUES as readonly string[]).includes(value);
}
```

### Handling unknown external data (parsed JSON, CLI output)

1. Parse to `unknown` first — never cast directly to a type.
2. Apply a type guard before accessing any typed properties.
3. Narrow further inside the guarded branch.

---

## Anti-Patterns to Avoid

| Anti-pattern | Correct approach |
|---|---|
| `throw new Error(...)` in a service | Return `fail(code, message)` |
| `import { Result } from '../types/results.js'` | Import from `'../types/index.js'` |
| `featureName as FeatureName` outside `toFeatureName()` | Call `toFeatureName(raw)` at the input boundary |
| Mutable interface property (missing `readonly`) | Add `readonly` to every interface field |
| `ok(null)` for a void success | Use `ok(undefined)` |
| Catching errors in service methods | Only repositories/clients catch; services propagate |
| Adding a model string without updating `CLAUDE_MODELS` | Add to the `CLAUDE_MODELS` array; type updates automatically |

---

## Final Step: Knowledge Sync

After completing all changes, update the knowledge file to keep it accurate:

1. Re-read the knowledge file at `.features/features-type-system/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new `ErrorCode` values you added
   - Any new branded types, discriminated unions, or const-assertion enums introduced
   - Any new anti-patterns or gotchas discovered during the work
   - Any sections that no longer match reality — correct or remove them
   - New entries in the **Related** section if new files were created
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
