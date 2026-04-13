---
name: features-claude-client
description: >
  Add a new Claude-powered operation, call ClaudeClient from a service, choose the right prompt delivery mode (systemPrompt vs appendSystemPrompt, print vs interactive), handle ClaudeClient errors and exit codes, or understand how stream-json output works. Use this skill whenever the task involves: ClaudeClient.execute(), ClaudeOptions, systemPromptFile, appendSystemPrompt, appendSystemPromptFile, the `print` flag, stream-json parsing, CLAUDE_NOT_FOUND, CLAUDE_FAILED, model resolution, or adding any new Claude-powered behaviour to the features project. Also use it when wiring a new service that needs to talk to Claude, or when you need to understand how the claude CLI subprocess is spawned and managed.
---

# Claude Client Integration Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-claude-client/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Quick Reference — Key Facts

These are the most critical facts to hold in mind while working. The knowledge file has the full details.

**`ClaudeClient` is a subprocess wrapper, not an SDK import.** All Claude calls go through `claudeClient.execute(ClaudeOptions)` which spawns the `claude` binary. Never import `@anthropic-ai/sdk`.

**Four prompt delivery modes — pick the right one:**

| Option | What it does | When to use |
|---|---|---|
| `systemPromptFile` | Replaces system prompt with an existing `.md` file | Static file on disk (e.g. `KB_PROMPT_PATH`) |
| `systemPrompt` | Writes string to temp file, replaces system prompt | One-off string, full persona override (KB creation) |
| `appendSystemPromptFile` | Appends existing `.md` file to system prompt | Static file that extends default behaviour (Skill creation) |
| `appendSystemPrompt` | Writes string to temp file, appends to system prompt | Dynamic content like KB markdown (Feature execution) |

**`print` flag controls rendering:**
- `print: true` → `-p --verbose --output-format stream-json` → stdout piped, spinners shown
- `print` omitted → `stdio: 'inherit'` → Claude's full interactive TUI renders in the terminal

**Error handling rules:**
- `execute()` never throws — always returns `Result<ClaudeResult>`
- `ENOENT` → `fail('CLAUDE_NOT_FOUND', ...)`; other spawn errors → `fail('CLAUDE_FAILED', ...)`
- Non-zero exit code returns `ok({ exitCode: N })`, NOT a failure — callers must check `exitCode !== 0` explicitly

**Models flow**: CLI `--model` flag → `FEATURES_MODEL` env var → `'sonnet'` default. Never hardcode a model string in a service.

**DI pattern**: `ClaudeClient` is constructed once in `src/index.ts` and injected into services as a constructor parameter.

**Claude calls belong in services, not commands.**

---

## Step-by-Step: Adding a New Claude-Powered Operation

### 1. Determine where the call belongs

Read the knowledge file's "Anti-Patterns" section. The call must go in a service (`src/services/`), never in a command file. If you're adding to an existing service, read that service file before editing. If you need a new service, read `src/index.ts` to understand how to wire it.

### 2. Choose your prompt delivery mode

Answer these questions to pick the right `ClaudeOptions` shape:

- **Does the operation need Claude's default tool access?** → Use `appendSystemPrompt` or `appendSystemPromptFile` (NOT `systemPrompt`)
- **Is the system prompt content a static file already on disk?** → Use `systemPromptFile` / `appendSystemPromptFile` (no temp file created)
- **Is the content a dynamic string built at runtime?** → Use `systemPrompt` / `appendSystemPrompt` (client writes temp file automatically)
- **Does the operation not need a special persona?** → Omit all system prompt options; embed instructions in `userPrompt`

### 3. Choose interactive vs. print mode

- User directly collaborates with Claude → omit `print` (interactive TUI)
- Background operation with spinners → `print: true`
- Update/maintenance tasks → `print: true`

### 4. Write the `execute()` call

Follow the reference patterns from the knowledge file exactly. A minimal call looks like:

```typescript
const result = await this.claudeClient.execute({
  appendSystemPrompt: dynamicContent,   // or whichever mode fits
  userPrompt: task,
  model,                                // always pass through, never hardcode
  print: true,                          // or omit for interactive
});
```

### 5. Handle the result correctly

Always handle both error paths AND the exit code:

```typescript
if (!result.ok) {
  // CLAUDE_NOT_FOUND or CLAUDE_FAILED (spawn-level error)
  return fail(result.error.code, result.error.message);
}

if (result.value.exitCode !== 0) {
  // Claude ran but reported failure
  return fail('CLAUDE_FAILED', `Claude exited with code ${result.value.exitCode}`);
}

// Success — proceed
```

For `print: false` (interactive) calls, exit code checking is optional since the user sees the output directly and can judge success.

### 6. If you added a new tool name to stream output

Open `src/clients/claude.client.ts` and add a case to `toolLabel()` for the new tool name so it renders a human-readable spinner label.

### 7. Wire dependency injection (new services only)

If you created a new service that takes `ClaudeClient`:
1. Read `src/index.ts`
2. Add `new YourService(deps, claudeClient)` following the existing pattern
3. The client is already constructed at the top of that file — do not construct another one

### 8. Model parameter

Ensure the new service method accepts `model: ClaudeModel` as a parameter and passes it to `execute()`. Refer to `src/types/config.ts` for the type and `src/lib/config.ts` for `DEFAULT_MODEL`.

---

## Common Pitfalls to Avoid

- **Using `systemPrompt` instead of `appendSystemPrompt` when adding context** — this strips Claude's default tool configuration
- **Only checking `result.ok` for print-mode calls** — `ok` only means the process didn't crash; always also check `exitCode`
- **Importing `@anthropic-ai/sdk`** — this project does not use the SDK; all calls go through the subprocess client
- **Putting `claudeClient.execute()` in a command file** — commands orchestrate; services call Claude
- **Hardcoding a model string** — always accept `model: ClaudeModel` as a parameter

---

## Final Step: Knowledge Sync

After completing all changes above, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `.features/features-claude-client/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new patterns introduced by your changes (e.g. a new prompt delivery pattern, a new service wiring style)
   - Any conventions that changed as a result of your work
   - Any sections that no longer reflect reality — remove or correct them
   - New entries in "Related" or "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
