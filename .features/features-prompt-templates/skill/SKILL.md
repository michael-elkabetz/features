---
name: features-prompt-templates
description: >
  Add a new prompt, choose between systemPrompt vs appendSystemPrompt, build a dynamic user
  prompt, add a static prompt file, or understand how prompts flow from services through
  ClaudeClient to the claude CLI in the features project. Use this skill whenever the task
  involves: creating a prompt file in prompts/, adding a named constant to config.ts for a
  prompt path, writing a buildXxxPrompt() function, choosing which ClaudeOptions fields to
  populate, embedding KB content into an appendSystemPrompt, or fixing a prompt-related bug
  (silently ignored systemPrompt, temp file collisions, Claude re-exploring the codebase
  despite an injected KB). Keywords: systemPrompt, appendSystemPrompt, systemPromptFile,
  appendSystemPromptFile, userPrompt, ClaudeOptions, prompt template, KB injection,
  CRITICAL RULES block.
---

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-prompt-templates/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Quick Reference — Critical Facts

These are the most important facts to have in mind before reading the full knowledge file:

### The Four Prompt Fields in `ClaudeOptions`

| Field | Effect | When to use |
|---|---|---|
| `systemPromptFile` | Replaces Claude's system prompt (reads from path) | Static file, large persona change |
| `systemPrompt` | Replaces Claude's system prompt (inline string → temp file) | Rare; small, dynamically built replacement |
| `appendSystemPromptFile` | Adds to Claude's system prompt (reads from path) | Static file that adds constraints without wiping defaults |
| `appendSystemPrompt` | Adds to Claude's system prompt (inline string → temp file) | Dynamic context injection (e.g., embedding KB content) |

**The file variant always wins**: if you pass both `systemPromptFile` and `systemPrompt`, the inline string silently loses. Pick one.

### The Four Patterns

1. **Static file, full replacement** (`systemPromptFile`) — use for giving Claude a clean-room persona (e.g., KB builder). File lives in `prompts/`, constant in `config.ts`.
2. **Static file, additive** (`appendSystemPromptFile`) — use to add constraints without erasing Claude's defaults (e.g., skill creation non-interactive rules).
3. **Dynamic inline, additive** (`appendSystemPrompt`) — use when embedding runtime data (e.g., live KB content). Always include the `CRITICAL RULES` block so Claude doesn't re-explore.
4. **No system prompt** — use when full context fits in a numbered-instruction `userPrompt`. Extract the builder into a named `buildXxxPrompt()` function.

### Naming Conventions

- Static prompt files: all-caps hyphen-separated in `prompts/` → `MY-FEATURE.md`
- Config constants: `MY_FEATURE_PROMPT_PATH = join(PACKAGE_ROOT, 'prompts', 'MY-FEATURE.md')`
- Builder functions: `buildEntityActionPrompt(args): string` — module-private, never exported

---

## Step-by-Step Guide

### Task: Add a New Static Prompt File

1. Read the knowledge file at `.features/features-prompt-templates/kb/KNOWLEDGE.md` for full context.
2. Create the file at `prompts/MY-OPERATION.md` (all-caps, hyphen-separated, at package root alongside `KB-CREATION.md` and `SKILL-CREATION.md`).
3. Read `src/lib/config.ts` to see how `KB_PROMPT_PATH` and `SKILL_CREATION_PROMPT_PATH` are defined.
4. Add a named constant:
   ```typescript
   export const MY_OPERATION_PROMPT_PATH = join(PACKAGE_ROOT, 'prompts', 'MY-OPERATION.md');
   ```
5. In the service that will use it, import the constant and pass it as `systemPromptFile` (for persona replacement) or `appendSystemPromptFile` (for additive constraints). Never inline the path string.

---

### Task: Choose `systemPrompt` vs `appendSystemPrompt`

Ask: **Does this call need to completely replace Claude's default behavior, or just add rules on top?**

- **Replace** → `systemPromptFile` / `systemPrompt`. The prompt should open by establishing a full persona ("You are a KB builder. Your only job is…").
- **Add constraints** → `appendSystemPromptFile` / `appendSystemPrompt`. The prompt can open with a section heading and a `## Non-Interactive Mode` / `## CRITICAL RULES` block.

Then ask: **Is the content static or runtime-constructed?**

- **Static** → prefer the `*File` variant (no temp-file write overhead, easier to inspect on disk).
- **Dynamic** → use the inline variant; `ClaudeClient` writes it to a temp file transparently.

---

### Task: Build a Dynamic `appendSystemPrompt` with Embedded KB Content

Follow Pattern 3 from the knowledge file exactly:

```typescript
const kbResult = await this.featureRepo.readKB(feature);

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
  kbResult.value,  // Full KB content embedded inline
].join('\n');

const result = await this.claudeClient.execute({
  appendSystemPrompt: appendPrompt,
  userPrompt: task,
  model,
});
```

**Do not omit the CRITICAL RULES block.** Without it, Claude ignores the injected KB and re-explores the codebase, which defeats the purpose of KB injection and wastes tokens.

---

### Task: Write a `userPrompt`-Only Call (No System Prompt)

Use Pattern 4 when the full context fits in numbered instructions:

1. Extract the prompt into a module-private builder function — never build it inline inside the `execute()` call:
   ```typescript
   function buildMyOperationPrompt(entityPath: string): string {
     return [
       `Investigate the current state of <entity> at ${entityPath}.`,
       '',
       'Instructions:',
       '1. Read the existing file to understand current state.',
       '2. Make the required changes.',
       '3. Keep the file under 500 lines.',
     ].join('\n');
   }
   ```
2. Call it in the service:
   ```typescript
   await this.claudeClient.execute({
     userPrompt: buildMyOperationPrompt(entityPath),
     model,
     print: true,
   });
   ```
3. No `systemPrompt` or `appendSystemPrompt` field — omit entirely.

---

### Task: Debug a Prompt That Seems to Be Ignored

Check these in order:

1. **File vs inline collision**: Did you pass both `systemPromptFile` and `systemPrompt`? The file variant silently wins. Remove the one you don't need.
2. **Missing CRITICAL RULES block**: If Claude is re-exploring the codebase despite an injected `appendSystemPrompt`, the rules block is absent or misplaced. Add it as the first section of the prompt content.
3. **Append vs replace confusion**: If Claude is not using its baseline capabilities (writing markdown, using tools), you may have used `systemPrompt` where `appendSystemPrompt` was intended. Switch to the append variant.
4. **`print` mode**: If output seems missing, check whether `print: true` is set. Without it, Claude's output goes directly to the terminal via `stdio: 'inherit'` rather than being streamed with spinners.

---

## Anti-Patterns to Avoid

- **Mixing `*File` and inline for the same prompt type** in one call — the file wins silently.
- **Hardcoding path strings** like `'prompts/KB-CREATION.md'` in services — always use named constants from `config.ts`.
- **Asking questions inside automated prompts** — every service call runs non-interactively. Prompts that pose questions will hang.
- **Building the `userPrompt` inline inside `execute()`** — extract it into a named `buildXxxPrompt()` function.
- **Omitting the CRITICAL RULES block** when embedding KB content in `appendSystemPrompt`.

---

## Files to Read When Editing

| What you're doing | Files to read first |
|---|---|
| Adding a static prompt file | `src/lib/config.ts`, `prompts/KB-CREATION.md` (as a reference example) |
| Changing how a service calls ClaudeClient | `src/types/claude.ts` (`ClaudeOptions`), the specific service file |
| Debugging prompt delivery | `src/clients/claude.client.ts` (see how options become CLI args) |
| Understanding additive vs replacement | `src/services/skill.service.ts` (Pattern 2), `src/services/kb.service.ts` (Pattern 1) |
| Understanding dynamic KB injection | `src/services/feature.service.ts` (Pattern 3) |

---

## Final Step: Knowledge Sync

After completing all changes above, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `.features/features-prompt-templates/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new patterns introduced by your changes (new prompt files, new builder functions, new `ClaudeOptions` usage)
   - Any naming conventions that changed (e.g., a new constant added to `config.ts`)
   - Any sections that no longer reflect reality — remove or correct them
   - New entries in "Related" or "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
