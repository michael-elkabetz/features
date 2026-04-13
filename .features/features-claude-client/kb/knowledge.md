---
description: "Use when calling Claude from a service, adding a new Claude-powered operation, choosing between prompt delivery modes, handling Claude errors, or understanding how stream output works. Keywords: ClaudeClient, execute, systemPrompt, appendSystemPrompt, print, stream-json, spawn, claude CLI, CLAUDE_NOT_FOUND, CLAUDE_FAILED, model."
category: component-patterns
---

# Claude Client Integration

## Overview

`ClaudeClient` is a thin subprocess wrapper around the `claude` CLI tool — it does **not** import the Anthropic SDK. Every Claude interaction in this project goes through `ClaudeClient.execute()`, which spawns the `claude` binary, passes prompts via CLI flags, and optionally streams back JSON events for progress display. The client is constructed once in `src/index.ts` and injected into every service that needs it.

Understanding this client is essential before adding any new Claude-powered behaviour: the way you compose `ClaudeOptions` directly determines whether Claude sees tool capabilities, how its output is rendered, and how errors propagate back to callers.

## Core Responsibilities

- **What it does**: Spawn the `claude` CLI, pass system/user prompts, pipe or inherit stdio, parse stream events, clean up temp files, and return a `Result<ClaudeResult>`.
- **What it does NOT do**: Import `@anthropic-ai/sdk`, manage sessions or conversation history, format or display errors to the user, or know anything about features/KBs/skills.

## Standard Structure

### The `ClaudeOptions` interface — choosing prompt delivery mode

Every call to `claudeClient.execute()` takes a `ClaudeOptions` object. There are four ways to supply a system prompt, each mapping to a different CLI flag:

```typescript
// src/types/claude.ts
export interface ClaudeOptions {
  // Replace the default system prompt entirely
  readonly systemPrompt?: string;       // → temp file → --system-prompt-file
  readonly systemPromptFile?: string;   // → --system-prompt-file (use existing file)

  // Append to the default system prompt (preferred for injecting KB context)
  readonly appendSystemPrompt?: string;      // → temp file → --append-system-prompt-file
  readonly appendSystemPromptFile?: string;  // → --append-system-prompt-file (use existing file)

  readonly userPrompt: string;   // Always required — passed as the final CLI argument
  readonly model?: string;       // → --model <model>
  readonly print?: boolean;      // true → -p --verbose --output-format stream-json
}
```

**Key insight**: When a string is provided for `systemPrompt` or `appendSystemPrompt`, the client writes it to a temp file (`os.tmpdir()/features-{sys|append}-{Date.now()}.md`) and deletes it after the process closes. This is necessary because the CLI only accepts file paths, not inline strings.

**When to use which**:

| Option | When to use |
|---|---|
| `systemPromptFile` | You have a static `.md` file on disk (e.g., `KB_PROMPT_PATH`) |
| `systemPrompt` | You need a one-off string that doesn't live on disk |
| `appendSystemPromptFile` | You want to extend Claude's default behaviour with a static file |
| `appendSystemPrompt` | You're injecting dynamic content like a KB string read from disk |

### Interactive mode vs. print mode

The `print` flag is the single most important option for controlling how output is rendered:

```typescript
// print: false (default) — Claude's full interactive UI renders directly in the terminal
const result = await this.claudeClient.execute({
  appendSystemPrompt: kbContent,
  userPrompt: task,
  model,
  // print omitted → stdio: 'inherit' → user sees Claude's native UI
});

// print: true — stdout is piped, stream-json events are parsed for spinners
const result = await this.claudeClient.execute({
  systemPromptFile: KB_PROMPT_PATH,
  userPrompt: userMessage,
  model,
  print: true,  // → -p --verbose --output-format stream-json
});
```

**Rule of thumb**: Use `print: true` for KB/skill creation steps where you want to show progress spinners but suppress Claude's interactive UI. Use `print: false` (or omit) for `features run`, where the user is directly collaborating with Claude.

## How Services Use the Client

Each service has a distinct call pattern. These are the reference implementations:

### KBService — full system prompt from file, print mode

KB creation uses `systemPromptFile` to fully replace Claude's system prompt with the KB-CREATION instructions:

```typescript
// src/services/kb.service.ts
const claudeResult = await this.claudeClient.execute({
  systemPromptFile: localPromptPath,  // replaces system prompt with KB-CREATION.md
  userPrompt: `Create a knowledge file for: ${topic}\n\nWrite the output to: ${kbFilePath}`,
  model,
  print: true,  // show spinners; Claude writes the file directly
});
```

After the call, the service checks that the output file actually exists — Claude's exit code 0 alone is not sufficient to confirm success.

### FeatureService — dynamic append prompt, interactive mode

Feature execution injects the KB as an append prompt so Claude retains its default tool capabilities:

```typescript
// src/services/feature.service.ts
const appendPrompt = [
  '# Feature KB — MANDATORY CONTEXT',
  '',
  'CRITICAL RULES:',
  '- You ALREADY have all the knowledge you need below. Do NOT explore, scan, or investigate the codebase.',
  '- ONLY read specific files when you need to edit them.',
  '- Follow the patterns and conventions described in the knowledge below exactly.',
  '',
  '---',
  '',
  kbResult.value,  // KB markdown injected here at runtime
].join('\n');

// When the feature has a skill, the userPrompt becomes a slash command invocation
const userPrompt = feature.hasSkill
  ? `/${feature.name} ${task}`   // invokes the registered Claude Code skill
  : task;

await this.claudeClient.execute({
  appendSystemPrompt: appendPrompt,  // KB context appended, not replacing
  userPrompt,
  model,
  // print omitted → interactive Claude UI
});
```

**Key takeaway**: `appendSystemPrompt` (not `systemPrompt`) is used here because it preserves Claude's default tool access. Replacing the system prompt entirely would break tool use.

### SkillService — append prompt file, print mode

Skill creation appends SKILL-CREATION.md instructions and invokes the `/skill-creator` agent:

```typescript
// src/services/skill.service.ts
const userMessage = [
  `/skill-creator Create a skill for "${topic}" based on the knowledge file at ${kbPath}.`,
  `Place ALL output inside ${skillDir}/`,
  `The knowledge file path for the Knowledge Sync feedback loop is: ${kbPath}`,
  'Do not ask me questions — read the knowledge file and create the skill.',
].join('\n\n');

await this.claudeClient.execute({
  appendSystemPromptFile: SKILL_CREATION_PROMPT_PATH,  // static file, no temp copy needed
  userPrompt: userMessage,
  model,
  print: true,
});
```

### Update operations — no system prompt, inline instructions

Both `KBService.updateKB` and `SkillService.updateSkill` use no system prompt at all — instructions are written directly into the user prompt string:

```typescript
// src/services/kb.service.ts
await this.claudeClient.execute({
  userPrompt: buildKBUpdatePrompt(feature.kbPath),  // self-contained instructions
  model,
  print: true,
});
```

This is intentional: updates don't need a special persona, just a clear task description. Claude handles it with default tool access.

## Error Handling

`ClaudeClient.execute()` never throws — it always returns `Result<ClaudeResult>`. There are two error paths:

```typescript
// src/clients/claude.client.ts
child.on('error', (err) => {
  cleanup();
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    // Binary not found on PATH
    resolve(fail('CLAUDE_NOT_FOUND', 'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code'));
  } else {
    // Other spawn errors
    resolve(fail('CLAUDE_FAILED', `Claude process error: ${err.message}`, err));
  }
});

child.on('close', (code) => {
  cleanup();
  resolve(ok({ exitCode: code ?? 0 })); // exit code is in the value, not an error
});
```

**Important**: A non-zero exit code does NOT trigger `fail()` — it returns `ok({ exitCode: N })`. Callers that care about the exit code must check it explicitly:

```typescript
// Pattern used in KBService and SkillService
if (claudeResult.value.exitCode !== 0) {
  return fail('CLAUDE_FAILED', `Claude exited with code ${claudeResult.value.exitCode}`);
}
```

## Model Configuration

Models flow from three sources, in priority order:

1. **CLI flag** — `--model <model>` passed by the user at invocation time
2. **Environment variable** — `process.env.FEATURES_MODEL` (set in shell or `.env`)
3. **Hardcoded default** — `'sonnet'`

```typescript
// src/lib/config.ts
export const DEFAULT_MODEL = (process.env.FEATURES_MODEL || 'sonnet') as ClaudeModel;

// src/types/config.ts
export const CLAUDE_MODELS = ['sonnet', 'opus', 'haiku'] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

export function resolveModel(raw: string | undefined, fallback: ClaudeModel): ClaudeModel {
  if (!raw) return fallback;
  if (isClaudeModel(raw)) return raw;
  return raw as ClaudeModel; // pass through unknown values — CLI validates
}
```

Commands resolve the model from the `--model` option and pass it down to services; services pass it to `claudeClient.execute()`. Never hardcode a model string inside a service.

## Dependency Injection

`ClaudeClient` is constructed once in `src/index.ts` and injected into all services that need it:

```typescript
// src/index.ts
const claudeClient = new ClaudeClient();

const featureService = new FeatureService(featureRepo, claudeClient);
const kbService = new KBService(fs, claudeClient);
const skillService = new SkillService(fs, claudeClient, gitClient);
```

Services receive it as a typed constructor parameter (`private readonly claudeClient: ClaudeClient`). There is no global singleton or service locator.

## Stream Event Rendering

When `print: true`, the client sets up a readline interface on stdout and parses each line as JSON. Two event shapes are handled:

- **`assistant` events** — contain `content` blocks. Text blocks are printed immediately; `tool_use` blocks display an `ora` spinner with a human-readable label (e.g., `Reading src/foo.ts`, `Grep: pattern`).
- **`result` events** — stop the spinner and print a summary: `Done (3 turns, 12s)` or `Error: ...`.

The `toolLabel()` function maps tool names to readable labels. If you add support for a new tool name, add a case there.

## Anti-Patterns

- **Importing the Anthropic SDK directly** — this project deliberately does not use the SDK. All Claude calls go through `ClaudeClient`. Adding an SDK dependency would bypass the streaming, error handling, and model routing logic.
- **Using `systemPrompt` when you should use `appendSystemPrompt`** — replacing the system prompt removes Claude's default tool configuration. Use append unless you specifically need to override the entire persona (as KB creation does).
- **Checking only `result.ok` after `print: true` calls** — `ok` only means the process didn't crash. Always also check `result.value.exitCode !== 0` for operations that must succeed.
- **Putting Claude calls in commands** — commands orchestrate; services call Claude. A command file should never call `claudeClient.execute()` directly.
- **Hardcoding model strings** — always accept `model: ClaudeModel` as a parameter and pass it through. Let the CLI flag and env var control defaults.

## Gotchas and Edge Cases

- **Temp files use `Date.now()` for uniqueness** — if two parallel executions happen simultaneously, there is a theoretical collision risk. In practice this project runs one Claude call at a time.
- **Temp files are cleaned up in both success and error paths** — the `cleanup()` function is called in both `error` and `close` handlers, not in a `finally` block. If you add new process event handlers, call `cleanup()` there too.
- **`print: false` + `stdio: 'inherit'`** — in this mode, Claude's full interactive TUI renders directly. There is no stdout to parse. Don't try to capture output in this mode.
- **Non-JSON lines are silently ignored** — the readline handler wraps `JSON.parse` in a try/catch. Diagnostic output or progress bars from the CLI that aren't JSON will be dropped without error.

## Related

- `src/clients/claude.client.ts` — the full client implementation
- `src/types/claude.ts` — `ClaudeOptions`, `ClaudeResult`, stream event types
- `src/types/results.ts` — `Result<T>`, `ErrorCode`, `ok()`, `fail()`
- `src/types/config.ts` — `ClaudeModel`, `resolveModel()`
- `src/lib/config.ts` — `DEFAULT_MODEL`, prompt file paths, `FEATURES_MODEL` env var
- `src/services/feature.service.ts` — reference for `appendSystemPrompt` + interactive mode
- `src/services/kb.service.ts` — reference for `systemPromptFile` + print mode + exit code check
- `src/services/skill.service.ts` — reference for `appendSystemPromptFile` + slash command invocation
- `.features/features-type-system/kb/knowledge.md` — Result type and error code patterns
