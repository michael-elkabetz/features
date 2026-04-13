---
description: "Use when adding new prompts, spinners, banners, error messages, or any terminal output to the features CLI. Also use when tracing how user input is captured, how cancellation is handled, or how Claude streaming output is rendered. Keywords: terminal UI, prompts, clack, chalk, ora, spinner, banner, ANSI, cancellation, streaming output, color, readline."
category: component-patterns
---

# Terminal UI Patterns

## Overview

The features CLI has a strict two-layer terminal UI model. All interactive prompts, colors, banners, and log messages live exclusively in `src/ui/prompts.ts` — commands import named functions from there and never call `@clack/prompts` or `chalk` directly. A second rendering path exists in `src/clients/claude.client.ts`, which handles streaming output from the Claude subprocess using `ora` spinners and raw `process.stdout.write`.

Understanding both layers is essential before touching any output code. Mixing them — e.g., calling `p.log.info()` from a service, or adding `chalk` imports to a command — breaks the encapsulation that keeps the UI consistent across all four commands.

## Core Responsibilities

**`src/ui/prompts.ts` should:**
- Export every named UI function that commands need (intro, outro, prompts, notes, errors, spinners)
- Own all hex color constants and styling decisions
- Be the only file that imports `@clack/prompts` and `chalk` (the one exception is `ora` in `claude.client.ts`)

**`src/ui/prompts.ts` should NOT:**
- Import from services, repositories, or clients
- Perform async I/O beyond what `@clack/prompts` prompts require
- Contain business logic or conditional flows

**Commands should:**
- Import exclusively from `../ui/prompts.js` for any terminal output
- Check `isCancelled()` immediately after every prompt `await`
- Always end every exit path (success, error, cancel) with `showOutro()`

## Standard Patterns

### Command Flow: Intro → Prompt → Check → Service → Error → Outro

Every command follows this sequence. Deviating breaks the visual consistency of the three-phase pipeline:

```typescript
export function makeCreateCommand(deps: CreateDeps) {
  return async function createCommand(topic, options) {
    showIntro(); // Always first — renders the ASCII BANNER + phase label via p.intro()

    // Prompt for input — or accept it from the CLI argument
    let finalTopic = topic;
    if (!finalTopic) {
      const result = await askTopic();
      if (isCancelled(result)) {       // Check immediately — before touching the value
        showOutro('Cancelled.');        // Always call showOutro before returning
        return;
      }
      finalTopic = result; // Only safe to use here, after the cancel check
    }

    // Spinner for a blocking async operation
    const spin = createSpinner();
    spin.start('Installing dependencies...');
    const installResult = await skillService.ensureSkillCreator();
    if (!installResult.ok) {
      spin.stop('Failed to install dependencies.'); // Stop spinner BEFORE any other output
      showError(installResult.error.message);
      return; // Fatal — no showOutro needed here
    }
    spin.stop('Dependencies ready.');

    // Claude streams its own output to stdout while this awaits
    const kbResult = await kbService.createKB(featureName, finalTopic, model);
    console.log(); // Blank line re-anchors clack's layout after Claude's raw stdout output

    if (!kbResult.ok) {
      showError(kbResult.error.message);
      showOutro(`Partial feature at .features/${featureName}/`); // Partial success — still show outro
      return;
    }

    // ...more prompts with isCancelled checks...

    showOutro(`${featureName} is ready.`); // Always last on every success path
  };
}
```

**Key takeaways:**
- `showIntro()` is always first; `showOutro()` is always last on every exit path
- Every `await ask*()` is immediately followed by `if (isCancelled(result))`
- `spin.stop()` must run before any subsequent `showError()` or log call
- `console.log()` spacers after Claude streaming re-anchor clack's rendering engine

---

### Phase Intro Functions

Each command has a dedicated intro function that renders the BANNER and a phase-specific label. Four intros exist — use the one that matches the phase the command belongs to:

| Function | Phase label | Used by |
|---|---|---|
| `showIntro()` | `Step 1 — KB Creation` | `create` command (start of KB phase) |
| `showBinahIntro()` | `Step 2: Binah — Skill Creation` | `create` command (after KB approval) |
| `showDaatIntro()` | `Step 3: Da'at — Deployment` | `create` command (after skill creation) |
| `showUpdateIntro()` | `Update — Refresh KB or Skill` | `update` command |
| `showRunIntro()` | `Implementation — Da'at` | `run` command |

`showIntro()`, `showUpdateIntro()`, and `showRunIntro()` each call `console.log(BANNER)` before `p.intro()`. `showBinahIntro()` and `showDaatIntro()` only call `console.log()` (blank line) + `p.intro()` — the BANNER was already shown by `showIntro()` earlier in the same session.

`showDaatNote()` is the companion to `showDaatIntro()` — it shows the slash-command invocation hint after a feature is deployed:

```typescript
// Rendered after deployment completes — tells the user how to invoke their new feature
showDaatNote(featureName);
// Output: "Invoke your new feature by typing /featureName in your code agent."
// featureName is styled in slate blue bold
```

---

### Cancellation: `isCancelled` Covers Both Sources

Every interactive prompt returns `T | symbol`. A symbol return means the user cancelled. The `isCancelled()` utility in `src/lib/errors.ts` handles both sources of cancellation:

```typescript
// src/lib/errors.ts
import { isCancel } from '@clack/prompts';

export function isCancelled(value: unknown): value is symbol {
  // isCancel handles the cancel symbol emitted by @clack/prompts on Ctrl-C
  // typeof check handles Symbol('cancel') created manually by askRunTask's raw readline
  return typeof value === 'symbol' || isCancel(value);
}
```

The dual check is intentional: `askRunTask` bypasses clack entirely and creates `Symbol('cancel')` directly, which `isCancel` alone would not recognize. Every other prompt returns clack's cancel symbol, which `isCancel` handles.

Commands always treat both identically:

```typescript
const result = await askFeatureName(suggested);
if (isCancelled(result)) {
  showOutro('Cancelled.');
  return;
}
// result is now narrowed to string — safe to use
const featureName: FeatureName = toFeatureName(result);
```

---

### Color Palette: Semantic, Not Decorative

Three hex colors are used throughout `prompts.ts` and `claude.client.ts`. No other custom hex colors exist in the codebase:

| Color | Hex | Semantic meaning | Typical usage |
|---|---|---|---|
| Gold | `#C9A227` | KB / Knowledge | File paths the user should act on, KB highlights, feature folder |
| Slate blue | `#7B68EE` | Skills / Actions | Phase labels, prompt markers (`>`), commands, skill paths |
| Brown (dim) | `#8B7355` | Secondary labels | Spelled-out text in the BANNER (Hochmah, Binah, Da'at) |
| Red | `chalk.red` | Errors | `showError()` exclusively |
| Green | `chalk.green` | Success | `showOutro()` default |
| Dim | `chalk.dim` | Hints, inactive states | Inactive skill paths, separator rules, hint text |

When adding new output, pick the semantically correct color:
- Displaying a **file path** the user will open or review → gold: `chalk.hex('#C9A227').bold(path)`
- Showing a **command or skill path** → slate blue: `chalk.hex('#7B68EE').underline(path)`
- Adding a **hint or secondary note** → `chalk.dim(text)`

---

### Spinner Types: Clack vs Ora

Two spinner implementations coexist. Always use the one that matches the context:

**Clack spinner (`createSpinner()`)** — use inside commands for blocking operations that happen before/between Claude invocations:

```typescript
const spin = createSpinner(); // wraps p.spinner() from @clack/prompts
spin.start('Installing dependencies...');
const result = await someService.doWork();
// Pass a final label to .stop() — it replaces the spinning text
spin.stop(result.ok ? 'Dependencies ready.' : 'Failed to install dependencies.');
```

**Ora spinner (`ora(...)`)** — used only inside `ClaudeClient`, for tool-use visualization during streaming. Not available to commands:

```typescript
// claude.client.ts — never replicate this pattern outside ClaudeClient
activeSpinner = ora({ text: label, indent: 2 }).start();
activeSpinner.text = newLabel; // update in-place as tool events arrive
activeSpinner.stop();           // stop when text output or result event fires
```

The difference matters: clack spinners integrate with clack's box-drawing layout; `ora` does not. Using `ora` in a command produces visual artifacts where clack redraws the screen.

---

### Structured Dialogs: note, select, confirm

**`p.note` for file-path summaries** — renders a bordered panel. Used exactly once (`showKbNote`) to surface the KB file path after Claude creates it, before asking the user what to do next:

```typescript
export function showKbNote(kbPath: string): void {
  p.note(
    `${kbPath}\n\n${chalk.dim('Review the KB file before proceeding to skill creation.')}`,
    'KB file ready', // title shown in the border
  );
}
```

Reserve `p.note()` for "here is the artifact you just produced — review it." For status updates, use `p.log.info()` via `showInfo()`.

**`p.select` with conditional hints** — use `hint` to signal limited availability without blocking the option:

```typescript
// hint communicates state without removing the option
if (feature.hasSkill) {
  options.push({ value: 'skill', label: 'Skill' });
} else {
  options.push({ value: 'skill', label: 'Skill', hint: 'no skill yet — run features skill first' });
}
```

**`p.confirm` for post-action decisions** — used only for optional follow-up actions (e.g., "Redeploy?"), never as a gate before the main flow.

---

### `askRunTask`: Raw Readline with ANSI Cursor Control

This is the only place in the codebase that bypasses clack entirely. It renders a two-line header (KB + skill paths) above a custom input prompt and manipulates the cursor using ANSI escape sequences:

```typescript
export async function askRunTask(feature: Feature): Promise<string | symbol> {
  const width = (process.stdout.columns || 100) - 2; // Respect terminal width; fall back to 98
  const rule = chalk.dim('─'.repeat(width));

  // Gold for KB path (knowledge layer), slate blue for skill (or dim if not yet created)
  const kbPath    = chalk.hex('#C9A227').underline(feature.kbPath);
  const skillPath = feature.hasSkill
    ? chalk.hex('#7B68EE').underline(feature.skillPath)
    : chalk.dim(feature.skillPath); // dim signals "unavailable"

  console.log(`  📚  ${kbPath}  🛠   ${skillPath}`);
  console.log(`  ${rule}`);

  process.stdout.write(`\n  ${rule}\n`);
  process.stdout.write('\x1b[2A\r'); // Move cursor up 2 lines to sit between the two rules

  return new Promise<string | symbol>((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let sigintCount = 0;

    const done = (value: string | symbol): void => {
      rl.close();
      process.stdout.write('\x1b[1B\n'); // Move cursor down before returning control
      res(value);
    };

    rl.on('SIGINT', () => {
      sigintCount++;
      if (sigintCount >= 2) {
        done(Symbol('cancel')); // Second Ctrl-C — return Symbol so isCancelled() catches it
        return;
      }
      // First Ctrl-C — write hint inline without disrupting the prompt line
      const hint = chalk.dim('  Press Ctrl-C again to exit');
      process.stdout.write(`\x1b[s\x1b[2B\r${hint}\x1b[u`); // save → down 2 → hint → restore
    });

    rl.question(`  ${chalk.hex('#7B68EE')('>')} `, (answer) => {
      done(answer.trim() || Symbol('cancel')); // Empty input also cancels
    });
  });
}
```

**Key takeaways:**
- `\x1b[2A` moves cursor up 2 lines; `\x1b[1B` down 1; `\x1b[2B` down 2
- `\x1b[s` saves cursor position; `\x1b[u` restores it — used to write the Ctrl-C hint without moving the input prompt
- The `Symbol('cancel')` return is caught by `isCancelled()` because of the `typeof symbol` check
- `process.stdout.columns` defaults to `100` in non-TTY environments (CI, piped output)

---

### Claude Streaming Output (`ClaudeClient`)

When Claude runs in `print` mode, output rendering moves from clack to `ora` + raw `process.stdout.write`. The Claude subprocess is spawned with `--output-format stream-json`, and each stdout line is parsed as a JSON event. Two event types drive the UI:

| Event type | Content | UI action |
|---|---|---|
| `assistant` with `text` block | Claude's narration | Stop spinner; `process.stdout.write('  ' + text + '\n')` |
| `assistant` with `tool_use` block | Active tool + inputs | Start/update ora spinner with tool-specific label |
| `result` | Timing + turn count | Stop spinner; write `Done (N turns, Xs)` |

Tool names are translated into readable labels:

```typescript
function toolLabel(block: ToolUseBlock): string | null {
  const name  = block.name || '';
  const input = block.input || {};
  // File path shown for Read/Write — most useful context while waiting
  if (name === 'Write' && input.file_path) return `Writing ${input.file_path}`;
  if (name === 'Read'  && input.file_path) return `Reading ${input.file_path}`;
  if (name === 'Glob')  return `Searching ${input.pattern || ''}`;
  if (name === 'Grep')  return `Grep: ${input.pattern || ''}`;
  if (name === 'Bash')  return (input.command as string) || 'Running command';
  if (name === 'Agent') return (input.description as string) || name;
  if (name)             return name; // fallback for any unrecognized tool
  return null;
}
```

When consecutive `tool_use` events arrive while a spinner is already active, the spinner label updates in-place (`activeSpinner.text = label`) rather than stopping and starting a new one. All streaming output uses a 2-space indent.

---

## Anti-Patterns

- **Calling `p.*` or `chalk.*` directly in a command** — All styling belongs in named functions in `prompts.ts`. Inline chalk calls scatter color decisions across the codebase and make consistent styling impossible.

- **Skipping `isCancelled()` after a prompt** — Passing a symbol downstream to a service or type cast causes silent runtime failures with no error message.

- **Using `ora` in commands or `prompts.ts`** — `ora` does not integrate with clack's output model. Use `createSpinner()` for all blocking operations in commands.

- **Not stopping the spinner before `showError()`** — A running `p.spinner()` redraws the current line; `p.log.error()` printed into it will be overwritten or interleaved.

- **Omitting `showOutro()` on any exit path** — Leaves the terminal with an unclosed clack frame that renders incorrectly in the next shell prompt.

- **Reusing a spinner across multiple operations** — Clack spinners are single-use. Create a new `createSpinner()` for each distinct blocking operation.

- **Adding new hex color values** — Use only the three named colors (`#C9A227`, `#7B68EE`, `#8B7355`) plus `chalk.red/green/dim`.

- **Calling `showBinahIntro()` or `showDaatIntro()` without a preceding `showIntro()`** — These phase intros don't print the BANNER; they assume it was already shown at the start of the command session.

## Gotchas and Edge Cases

- **`console.log()` after Claude streaming** — Claude's streaming output is written directly to stdout. Always add `console.log()` immediately after the awaited service call returns to give clack a clean line to work from.

- **`askFeatureName` uses `undefined` not `''` for `initialValue`** — Passing an empty string to clack's `initialValue` pre-fills the field and forces the user to clear it. Pass `suggested || undefined` so the field appears empty with a placeholder when there's no suggestion.

- **Spinner `.text` property only on `ora`** — The clack spinner from `createSpinner()` exposes `.start()` and `.stop()` but not `.text`. Only `ora` instances (in `ClaudeClient`) support in-place label updates via `.text`.

- **BANNER and `p.intro()` interaction** — The BANNER is printed with `console.log(BANNER)` before `p.intro()`. This is intentional: `p.intro()` only draws the bottom border of a box; the BANNER provides the visual header above it.

- **`showOutro()` default vs. custom** — `showOutro()` with no argument prints `chalk.green('Done.')`. Pass a string to surface specific saved paths or partial success messages.

- **`showFeatureFolder` timing** — Call `showFeatureFolder(join('.features', featureName))` immediately after the feature name is confirmed, before the spinner starts. It logs the path the user can navigate to while Claude runs.

## Related

- `src/ui/prompts.ts` — the entire UI layer; all functions documented here live here
- `src/clients/claude.client.ts` — streaming spinner implementation; `handleStreamEvent` and `toolLabel` functions
- `src/lib/errors.ts` — `isCancelled()` implementation used after every `ask*` call
- `src/commands/create.ts` — the most complete command UI flow: all three phases, spinners, note panel, and review loop
- `src/commands/run.ts` — shows `askSelectFeature` + `askRunTask` in context
- `src/commands/update.ts` — shows conditional `askUpdateTarget` with hints and `askRedeploy`
- `.features/features-cli-commands/kb/KNOWLEDGE.md` — how commands are wired and registered
- `.features/features-claude-client/kb/KNOWLEDGE.md` — ClaudeClient options and streaming modes
