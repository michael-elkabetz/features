---
description: "Use when adding a new prompt, choosing between systemPrompt vs appendSystemPrompt, building dynamic user prompts, adding a static prompt file, or understanding how prompts flow from services through ClaudeClient to the claude CLI. Keywords: prompt, systemPrompt, appendSystemPrompt, template, userPrompt, ClaudeOptions, KB-CREATION, SKILL-CREATION."
category: component-patterns
---

# Prompt Templates

## Overview

The features project has two kinds of prompts: **static files** in `prompts/` that define large, reusable system behaviors, and **dynamic strings** built inline in services for per-invocation context. Both kinds are delivered to the `claude` CLI via `ClaudeClient.execute()`, which maps them to `--system-prompt-file` or `--append-system-prompt-file` CLI flags.

There is no template language (no mustache, no handlebars). Variable substitution is plain TypeScript template literals. The key architectural rule is that `systemPrompt` replaces Claude's base behavior while `appendSystemPrompt` adds to it — getting this wrong breaks the system's design.

---

## Core Responsibilities

**What prompts should do:**
- Set Claude's persona and constraints for a specific operation
- Inject runtime data (file paths, KB content) that Claude needs to act without exploring
- Give Claude unambiguous, numbered instructions for automated pipelines

**What prompts should NOT do:**
- Embed business logic that belongs in the service layer
- Contain hardcoded file paths (use variables and config constants)
- Ask the user questions (all prompts are used in non-interactive, automated mode)

---

## Standard Structure

### The `ClaudeOptions` Interface

Every call to `ClaudeClient.execute()` passes a `ClaudeOptions` object. Understanding its four prompt fields is essential:

```typescript
// src/types/claude.ts
export interface ClaudeOptions {
  readonly systemPrompt?: string;           // Replaces Claude's system prompt (inline string)
  readonly systemPromptFile?: string;       // Replaces Claude's system prompt (file path)
  readonly appendSystemPrompt?: string;     // Adds to Claude's system prompt (inline string)
  readonly appendSystemPromptFile?: string; // Adds to Claude's system prompt (file path)
  readonly userPrompt: string;              // Required: the user's message to Claude
  readonly model?: string;                  // Optional: e.g. 'sonnet'
  readonly print?: boolean;                 // Stream output with spinners when true
}
```

The `*File` and inline variants are mutually exclusive per type — `ClaudeClient` checks `systemPromptFile` before `systemPrompt` (file wins). Use `*File` for static disk files; use the inline variant for dynamically constructed strings.

### How ClaudeClient Converts Strings to Files

The `claude` CLI only accepts file paths, not inline strings. `ClaudeClient` handles this transparently:

```typescript
// src/clients/claude.client.ts — simplified
if (systemPromptFile) {
  args.push('--system-prompt-file', systemPromptFile);  // Pass path directly
} else if (systemPrompt) {
  // Write string to a temp file, then pass that path
  const tmpFile = join(tmpdir(), `features-sys-${Date.now()}.md`);
  await writeFile(tmpFile, systemPrompt, 'utf-8');
  tmpFiles.push(tmpFile);                               // Queued for cleanup
  args.push('--system-prompt-file', tmpFile);
}
// Same pattern for appendSystemPrompt / appendSystemPromptFile
```

**Key takeaway**: Prefer `*File` options for static content (avoids the write/cleanup overhead). Use inline strings when the content is constructed at runtime from variables.

---

## Patterns

### Pattern 1 — Static File for Full Persona Replacement

**Why this exists**: KB creation gives Claude a completely different role (KB builder). The system prompt must fully replace Claude's defaults. The prompt is 400+ lines — too large and too stable to embed in code.

```typescript
// src/services/kb.service.ts
const claudeResult = await this.claudeClient.execute({
  systemPromptFile: KB_PROMPT_PATH,          // Full persona: "You are a KB builder"
  userPrompt: `Create a knowledge file for: ${topic}\n\nWrite the output to: ${kbFilePath}`,
  model,
  print: true,
});
```

`KB_PROMPT_PATH` is resolved once in `config.ts` relative to the package root — never hardcoded in services.

**Key takeaway**: Use `systemPromptFile` when you need a clean-room persona. The static file lives in `prompts/` and is referenced via a named constant in `config.ts`.

---

### Pattern 2 — Static File for Additive Context

**Why this exists**: Skill creation builds on top of Claude's default behavior (it already knows how to write markdown, structure files, etc.). The prompt only adds constraints — "non-interactive mode, this exact structure." Appending preserves Claude's base capabilities while narrowing them.

```typescript
// src/services/skill.service.ts
const result = await this.claudeClient.execute({
  appendSystemPromptFile: SKILL_CREATION_PROMPT_PATH,  // Adds constraints, doesn't replace
  userPrompt: userMessage,
  model,
  print: true,
});
```

`SKILL-CREATION.md` opens with `# Features CLI — Skill Creation Context` and its first section is `## Non-Interactive Mode` — a list of things Claude must NOT do. This is the "constraint layer" pattern.

**Key takeaway**: Use `appendSystemPromptFile` when you need to add rules without wiping Claude's baseline. Both `systemPrompt` and `appendSystemPrompt` can coexist in a single call.

---

### Pattern 3 — Dynamic String with Embedded Runtime Data

**Why this exists**: Feature execution must inject the KB content into the system prompt at runtime — the content is unknown at compile time and changes per-feature. An inline string built from the live KB file makes this possible without any templating language.

```typescript
// src/services/feature.service.ts
const kbResult = await this.featureRepo.readKB(feature);  // Read KB from disk

// Build the append prompt by embedding the KB text directly
const appendPrompt = [
  '# Feature KB — MANDATORY CONTEXT',
  '',
  'CRITICAL RULES:',
  '- You ALREADY have all the knowledge you need below. Do NOT explore, scan, or investigate the codebase to understand it.',
  '- Do NOT use Glob, Grep, or subagents to discover patterns or architecture — that work has already been done for you.',
  '- ONLY read specific files when you need to edit them.',
  '- Follow the patterns and conventions described in the knowledge below exactly.',
  '',
  '---',
  '',
  kbResult.value,  // ← Full KB file content embedded inline
].join('\n');

const result = await this.claudeClient.execute({
  appendSystemPrompt: appendPrompt,  // Inline string (will be written to temp file)
  userPrompt: feature.hasSkill
    ? `/${feature.name} ${task}`     // Slash command if skill exists
    : task,                          // Plain task if no skill
  model,
});
```

**Key takeaway**: Array-of-strings joined with `\n` is the idiom for multiline dynamic prompts. The KB is embedded directly — no file paths, no lazy loading. The `CRITICAL RULES` block prevents Claude from re-discovering what the KB already contains, which is the core speed optimization.

---

### Pattern 4 — Plain `userPrompt` with No System Prompt

**Why this exists**: Update operations (`updateKB`, `updateSkill`) rely on Claude's default behavior. The instructions are entirely in the user prompt, which is built from a `build*UpdatePrompt()` helper function. No system prompt means Claude uses its built-in judgment, constrained only by the numbered instructions.

```typescript
// src/services/kb.service.ts
function buildKBUpdatePrompt(kbPath: string): string {
  return [
    `Investigate the current state of the codebase and update the KB at ${kbPath}.`,
    '',
    'Instructions:',
    `1. Read the existing KB at ${kbPath} to understand what it currently covers.`,
    '2. Scan the codebase — use Glob, Grep, and Read to discover what has changed.',
    '3. Compare the current code against what the KB describes.',
    '4. Update the KB in place:',
    '   - Fix any sections that no longer reflect reality',
    '   - Add new patterns, conventions, or architecture that emerged since the last update',
    '   - Keep the same YAML frontmatter format (description, category)',
    '5. Keep the file under 500 lines.',
    '6. Do NOT rewrite from scratch — revise existing sections.',
  ].join('\n');
}

// Usage: no systemPrompt at all
await this.claudeClient.execute({
  userPrompt: buildKBUpdatePrompt(feature.kbPath),
  model,
  print: true,
});
```

**Key takeaway**: Not every call needs a system prompt. When the full context fits in a numbered-instruction user prompt, omit the system prompt. Extract the builder into a named function (`buildKBUpdatePrompt`, `buildSkillUpdatePrompt`) to keep the service method readable.

---

## Prompt File Conventions

### Adding a New Static Prompt File

1. Create the file in `prompts/` at the package root (alongside `KB-CREATION.md` and `SKILL-CREATION.md`)
2. Add a named path constant to `src/lib/config.ts`:
   ```typescript
   export const MY_FEATURE_PROMPT_PATH = join(PACKAGE_ROOT, 'prompts', 'MY-FEATURE.md');
   ```
3. Import and use the constant in the service — never inline the path string

### Naming Convention for Prompt Files

- All caps, hyphen-separated: `KB-CREATION.md`, `SKILL-CREATION.md`
- Name reflects the operation, not the feature: `KB-CREATION` not `KNOWLEDGE-BASE`

### Naming Convention for Dynamic Builder Functions

- `build[Entity][Action]Prompt(args)` — e.g., `buildKBUpdatePrompt(kbPath)`, `buildSkillUpdatePrompt(skillPath, kbPath)`
- Always a module-private function (`function build...`, not exported)
- Always returns `string` (not `ClaudeOptions` or anything composite)

---

## Anti-Patterns

- **Mixing file-based and inline for the same type** — `systemPromptFile` takes precedence over `systemPrompt`. If you pass both, the inline version silently loses. Pick one.
- **Hardcoding `prompts/` paths in services** — always use the named constants from `config.ts`. Paths that are scattered across the codebase break when the package moves.
- **Asking questions in automated prompts** — every service call runs non-interactively. Prompts that ask "what would you like?" will hang or produce garbage. All context must be in the user prompt.
- **Embedding `userPrompt` logic inside `ClaudeOptions` construction** — extract builder functions so the `execute()` call stays readable.
- **Omitting the CRITICAL RULES block in feature execution** — without it, Claude will ignore the injected KB and re-explore the codebase, which defeats the entire purpose of the KB injection.

---

## Gotchas and Edge Cases

- **Temp file naming uses `Date.now()`** — if two processes call `ClaudeClient.execute()` simultaneously with inline prompts, they could collide. This is unlikely in practice but worth noting for parallel execution scenarios.
- **Temp files are cleaned up in the `close` event** — if the process is killed before `close` fires, orphaned files will remain in `tmpdir()`. They're harmless but accumulate.
- **`appendSystemPrompt` does NOT interact with `systemPromptFile`** — the two flags are independent. You can use `systemPromptFile` for the base persona and `appendSystemPromptFile` (or `appendSystemPrompt`) for additive context in the same call.
- **`print: false` (default) uses `stdio: 'inherit'`** — Claude's output goes directly to the terminal. Spinners and streaming only happen when `print: true`. The feature execution call in `feature.service.ts` omits `print` intentionally, letting Claude output flow directly.

---

## Related

- `src/types/claude.ts` — `ClaudeOptions` interface and stream event types
- `src/clients/claude.client.ts` — how prompt options become CLI arguments and temp files
- `src/lib/config.ts` — `KB_PROMPT_PATH` and `SKILL_CREATION_PROMPT_PATH` constants
- `src/services/kb.service.ts` — Pattern 1 (static systemPromptFile) and Pattern 4 (plain userPrompt)
- `src/services/skill.service.ts` — Pattern 2 (appendSystemPromptFile) and Pattern 4 variant
- `src/services/feature.service.ts` — Pattern 3 (dynamic appendSystemPrompt with embedded KB)
- `prompts/KB-CREATION.md` — full KB builder system prompt (427 lines)
- `prompts/SKILL-CREATION.md` — skill creation append prompt (77 lines)
- `.features/features-claude-client/kb/KNOWLEDGE.md` — ClaudeClient internals and streaming
