---
name: features-cli-commands
description: >
  Add a new CLI command, extend an existing command, understand how commands are registered and
  wired, handle command arguments and options, or trace how user input flows through the system.
  Use this skill whenever the task involves: creating a makeXxxCommand factory, registering a
  command in Commander.js, adding --model or positional argument support, wiring a command in
  src/index.ts, handling isCancelled() after prompts, implementing multi-phase command workflows,
  or debugging why a command crashes on Ctrl-C. Keywords: command, Commander.js, makeCommand,
  factory, action, argument, option, model, isCancelled, composition root, showOutro, showError,
  runCommand, createCommand, skillCommand, updateCommand.
---

# Features CLI Commands

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-cli-commands/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Quick-Reference: Critical Patterns

Keep these facts in mind throughout — they are the most common sources of bugs:

| Concern | Rule |
|---|---|
| Factory function | `export function makeXxxCommand(deps: XxxDeps)` — returns the async action handler |
| Composition root | `src/index.ts` is the **only** place that instantiates anything or wires deps |
| Model resolution | Always `resolveModel(options.model, DEFAULT_MODEL)` — never pass `options.model` raw |
| Cancellation | `isCancelled(result)` after **every** `p.text()`, `p.select()`, `p.confirm()` call |
| Exit paths | Every return path calls `showOutro()` — except `run`, which hands off to Claude |
| Error display | Commands call `showError()`. Services return `fail(code, message)`. Never cross this line. |
| Arg type | Commander passes `undefined` for optional args — declare as `string \| undefined` |
| `toFeatureName()` | Normalizes raw CLI input to branded `FeatureName`, idempotent |
| Business logic | If you're doing more than "call service → check result → show error", extract to a service |

---

## Step-by-Step: Adding a New Command

### Step 1 — Read the target files

Read these files before writing a single line:
- `.features/features-cli-commands/kb/KNOWLEDGE.md` (mandatory, do this first)
- `src/commands/run.ts` — simplest existing command, ideal reference shape
- `src/index.ts` — composition root where you will register the new command

If the new command calls a service you haven't seen before, also read that service file.

### Step 2 — Create `src/commands/xxx.ts`

Use the factory pattern exactly:

```typescript
// src/commands/xxx.ts

interface XxxOptions {
  model?: string;           // Commander delivers raw string; resolve before use
}

interface XxxDeps {
  someService: SomeService; // Only deps this command actually uses
}

export function makeXxxCommand(deps: XxxDeps) {
  const { someService } = deps; // Destructure at factory level

  return async function xxxCommand(
    argFromCli: string | undefined,   // Optional positional arg — always | undefined
    options: XxxOptions
  ): Promise<void> {
    showXxxIntro();

    // --- Fetch data needed for selection ---
    const listResult = await someService.listItems();
    if (!listResult.ok) {
      showError(listResult.error.message);
      showOutro();
      return;
    }
    const items = listResult.value;

    // --- Resolve the selection (three-way pattern) ---
    let selected: Item | undefined;
    if (argFromCli) {
      const normalized = toFeatureName(argFromCli);
      selected = items.find((i) => i.name === normalized);
      if (!selected) {
        showError(`"${normalized}" not found. Available: ${items.map((i) => i.name).join(', ')}`);
        showOutro();
        return;
      }
      showInfo(`Using ${selected.name}`);
    } else if (items.length === 1) {
      selected = items[0];
      showInfo(`Using ${selected.name}`);
    } else {
      const result = await askSelectItem(items);
      if (isCancelled(result)) {
        showOutro('Cancelled.');
        return;
      }
      selected = items.find((i) => i.name === result);
    }

    // --- Model resolution ---
    const model: ClaudeModel = resolveModel(options.model, DEFAULT_MODEL);

    // --- Call the service ---
    const actionResult = await someService.doThing(selected, model);
    if (!actionResult.ok) {
      showError(actionResult.error.message);
      showOutro();
      return;
    }

    showOutro('Done.');
  };
}
```

**What to import:**
- `isCancelled` from `src/lib/errors.ts`
- `toFeatureName` from `src/types/features.ts`
- `resolveModel`, `ClaudeModel`, `DEFAULT_MODEL` from `src/types/config.ts`
- `showError`, `showOutro`, `showInfo`, `showXxxIntro` from `src/ui/prompts.ts`
- Prompt helpers (`askSelectXxx`, etc.) from `src/ui/prompts.ts`

### Step 3 — Wire it in `src/index.ts`

Open `src/index.ts` and make three additions:

**3a. Add the import at the top:**
```typescript
import { makeXxxCommand } from './commands/xxx.js';
```

**3b. Instantiate deps and build the command (in the wiring block):**
```typescript
const xxxCommand = makeXxxCommand({ someService });
```

**3c. Register with Commander:**
```typescript
program
  .command('xxx')
  .description('Short description of what this command does')
  .argument('[topic]', 'Optional positional arg description')   // omit if not needed
  .option('-m, --model <model>', 'Claude model to use (e.g., sonnet, opus, haiku)')
  .action(xxxCommand);
```

Rules for registration:
- Arguments (`.argument()`) always come before options (`.option()`)
- The `-m, --model` flag is present on every command that spawns Claude
- `{ isDefault: true }` on a command makes it the default when no subcommand is given — only one command gets this

### Step 4 — Handle multi-phase workflows (if needed)

If the command coordinates multiple sequential AI operations (like `create` does), structure it as:

```typescript
// Phase 1
const phase1Result = await serviceA.doPhase1(params);
if (!phase1Result.ok) {
  handleError(phase1Result.error);
  showOutro(`Phase 1 failed. Nothing was saved.`);
  return;
}

// Between phases: optional user review loop
while (true) {
  const review = await askReview(phase1Result.value);
  if (isCancelled(review) || review === 'skip') {
    showOutro(`Phase 1 output saved. Run 'features xxx <name>' to continue.`);
    return;
  }
  if (review === 'edit') {
    await editorClient.open(phase1Result.value);
    continue;
  }
  break; // 'approve'
}

// Phase 2
const phase2Result = await serviceB.doPhase2(params);
if (!phase2Result.ok) {
  handleError(phase2Result.error);
  showOutro(`Phase 2 failed. Phase 1 output was saved at <path>.`); // Tell them what WAS saved
  return;
}
```

Key points:
- Each phase's failure message tells the user what *was* saved so they can recover
- Use `while (true)` + `break` for review loops — not recursion
- Independent service calls, not one monolithic function

---

## Step-by-Step: Extending an Existing Command

### Step 1 — Read the command file and knowledge base

Read `.features/features-cli-commands/kb/KNOWLEDGE.md` first, then open the specific command file you're extending.

### Step 2 — Identify the right extension point

- Adding a new prompt? Add it to `src/ui/prompts.ts`, then call it in the command
- Adding a new service call? Wire the service in `src/index.ts`, add it to the command's `XxxDeps` interface
- Adding a new option? Declare it in `XxxOptions`, add `.option()` in `src/index.ts`, resolve before use
- Adding business logic? Don't — put it in a service method and call that

### Step 3 — Maintain all invariants

After any change, verify:
- Every `p.text()` / `p.select()` / `p.confirm()` call has an `if (isCancelled(...))` guard immediately after
- Every return path calls `showOutro()` (except for the `run` command's success path)
- `options.model` is resolved through `resolveModel()` before being passed anywhere
- No business logic lives in the command file

---

## Common Mistakes to Avoid

**Skipping `isCancelled()` after a prompt** — `@clack/prompts` returns a `Symbol` on Ctrl-C. TypeScript will catch some cases (symbol not assignable to string), but runtime crashes are also possible.

**Forgetting `showOutro()` on an error path** — scan all `return` statements before finishing. Each one should be preceded by `showOutro()` (or `showOutro('Cancelled.')`, etc.).

**Passing `options.model` directly to a service** — always wrap: `resolveModel(options.model, DEFAULT_MODEL)`.

**Putting display calls in a service** — services never call `showError()`. They return `fail(code, message)` and the command surfaces the error.

**Importing one command from another** — commands are siblings. Shared logic goes in `src/lib/`.

**Skipping the `| undefined` on optional args** — Commander passes `undefined` when the user doesn't provide a positional arg. Declaring it as just `string` causes a TypeScript error.

---

## The `run` Command Exception

The `run` command is the only command that does **not** call `showOutro()` on its success path — it hands off control to an interactive Claude terminal session. `showOutro()` would appear before Claude's output and look wrong. This is intentional and documented.

---

## The `skill.ts` Exception

`skill.ts` is the one command that imports `FilesystemRepository` directly. This is because it must check for both the new KB path (`kb/KNOWLEDGE.md`) and the legacy path (`knowledge/KNOWLEDGE.md`) before handing off to the service. All other commands never touch the filesystem directly.

---

## Final Step: Knowledge Sync

After completing all changes above, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `.features/features-cli-commands/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new patterns introduced by your changes (new command shapes, new three-way selection variants, new multi-phase structures)
   - Any conventions that changed as a result of your work
   - Any sections that no longer reflect reality — remove or correct them
   - New entries in "Related" or "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
