---
name: features-terminal-ui
description: >
  Add new prompts, spinners, banners, error messages, log calls, or any terminal output to the features CLI.
  Also use when tracing how user input is captured, how cancellation is handled, how Claude streaming output
  is rendered, or how colors and ANSI sequences work. Use this skill whenever the task involves:
  creating or modifying a named UI function in prompts.ts, adding a clack prompt (text, select, confirm),
  wiring isCancelled() after a new ask* call, choosing the right spinner (clack vs ora), adding a p.note()
  panel, handling Ctrl-C in a readline prompt, displaying file paths with the correct color, or understanding
  why a spinner and showError() are interleaving incorrectly. Keywords: terminal UI, prompts, clack, chalk,
  ora, spinner, banner, ANSI, cancellation, streaming output, color, readline, askRunTask, showIntro, showOutro,
  isCancelled, createSpinner.
---

# Features Terminal UI

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `.features/features-terminal-ui/kb/KNOWLEDGE.md`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them

---

## Quick-Reference: What Lives Where

| Concern | File |
|---|---|
| All interactive prompts, colors, banners, log messages | `src/ui/prompts.ts` |
| Streaming spinner (tool-use visualization) | `src/clients/claude.client.ts` |
| `isCancelled()` utility | `src/lib/errors.ts` |
| Most complete command UI flow (all three phases) | `src/commands/create.ts` |
| `askSelectFeature` + `askRunTask` in context | `src/commands/run.ts` |
| Conditional hints and `askRedeploy` | `src/commands/update.ts` |

**Two-layer model — never cross the boundary:**
- `src/ui/prompts.ts` is the only file that imports `@clack/prompts` and `chalk`
- `src/clients/claude.client.ts` uses `ora` for tool-use spinners during streaming
- Commands import exclusively from `../ui/prompts.js` — never call `p.*` or `chalk.*` directly

---

## Color Palette — Three Named Colors Only

| Semantic | Hex | Use for |
|---|---|---|
| Gold | `#C9A227` | File paths the user should open/review, KB highlights |
| Slate blue | `#7B68EE` | Phase labels, prompt markers (`>`), commands, skill paths |
| Brown (dim) | `#8B7355` | Spelled-out banner text (Hochmah, Binah, Da'at) |
| Red | `chalk.red` | `showError()` exclusively |
| Green | `chalk.green` | `showOutro()` default |
| Dim | `chalk.dim` | Hints, inactive states, separator rules |

Never add new hex values. Pick the semantically correct one from this table.

---

## Step 1: Identify what you are adding

Read the knowledge file. Then determine which of these cases applies:

**A. New named UI function** → add it to `src/ui/prompts.ts`. Keep business logic out.  
**B. New prompt in a command** → add an `ask*` function to `prompts.ts`, then call it from the command with an immediate `isCancelled()` check.  
**C. New spinner in a command** → use `createSpinner()` from `prompts.ts` — never `ora`.  
**D. Streaming/tool-use visualization** → touch only `src/clients/claude.client.ts`.  
**E. New color or style** → use one of the three named hex values above; do not add a fourth.  
**F. New phase intro** → add to `prompts.ts` and follow the BANNER rules below.

---

## Step 2: Read the file you will edit

Before writing any code, read the current state of the target file:
- Adding a UI function → read `src/ui/prompts.ts`
- Adding a command call → read the relevant command file AND `src/ui/prompts.ts`
- Touching streaming output → read `src/clients/claude.client.ts`

---

## Step 3: Apply the correct pattern

### Adding a named UI function to `prompts.ts`

```typescript
// Good — pure output, no I/O beyond what clack needs
export function showFeatureReady(name: string): void {
  p.log.success(`Feature ${chalk.hex('#C9A227').bold(name)} is ready.`);
}

// Bad — contains business logic or imports from services
export async function showFeatureReadyAndDeploy(name: string): Promise<void> { ... }
```

### Adding a new prompt (ask* function)

```typescript
export async function askConfirmReset(): Promise<boolean | symbol> {
  return p.confirm({
    message: 'Reset this feature? This cannot be undone.',
  });
}
```

Then in the command, immediately after the `await`:

```typescript
const confirmed = await askConfirmReset();
if (isCancelled(confirmed)) {
  showOutro('Cancelled.');
  return;
}
if (!confirmed) {
  showOutro('No changes made.');
  return;
}
```

### Adding a spinner for a blocking operation

```typescript
const spin = createSpinner();
spin.start('Doing the thing...');
const result = await someService.doWork();
spin.stop(result.ok ? 'Done.' : 'Failed.');  // Always stop before showError()

if (!result.ok) {
  showError(result.error.message);
  return;
}
```

**Never reuse a spinner across operations** — create a new `createSpinner()` for each distinct step.  
**Always call `.stop()` before any `showError()` or log call.**

### After a Claude streaming call

```typescript
const result = await claudeService.run(options);
console.log(); // ← always add this blank line — re-anchors clack's layout after raw stdout
if (!result.ok) {
  showError(result.error.message);
  ...
}
```

### Phase intro functions

Use the existing intro that matches the phase. Do NOT create a new one unless a genuinely new phase exists:

| Function | When to call |
|---|---|
| `showIntro()` | Always the very first call — renders BANNER + "Step 1" label |
| `showBinahIntro()` | After KB is approved — no BANNER (already shown) |
| `showDaatIntro()` | After skill creation — no BANNER |
| `showUpdateIntro()` | `update` command — renders BANNER |
| `showRunIntro()` | `run` command — renders BANNER |

If you must add a new phase intro that should NOT print the BANNER, use `console.log()` + `p.intro()` only.  
If it should print the BANNER (new top-level command), add `console.log(BANNER)` before `p.intro()`.

### `p.note()` panels

Reserve for "here is the artifact you just produced — review it." Not for status updates.

```typescript
export function showKbNote(kbPath: string): void {
  p.note(
    `${chalk.hex('#C9A227').underline(kbPath)}\n\n${chalk.dim('Review before proceeding.')}`,
    'KB file ready',
  );
}
```

### `p.select` with conditional hints

Signal unavailability via `hint`, not by removing the option:

```typescript
options.push(feature.hasSkill
  ? { value: 'skill', label: 'Skill' }
  : { value: 'skill', label: 'Skill', hint: 'no skill yet — run features skill first' }
);
```

---

## Step 4: Wire cancellation correctly

`isCancelled()` (from `src/lib/errors.ts`) covers two sources:
- `isCancel(value)` — clack's cancel symbol from Ctrl-C on any `p.*` prompt
- `typeof value === 'symbol'` — `Symbol('cancel')` from `askRunTask`'s raw readline

Check immediately after every prompt `await` — before touching the returned value in any way:

```typescript
const name = await askFeatureName(suggested);
if (isCancelled(name)) {   // ← before any cast, trim, or use
  showOutro('Cancelled.');
  return;
}
const featureName: FeatureName = toFeatureName(name); // safe only after the check
```

---

## Step 5: Close every exit path with `showOutro()`

Every return path in a command must call `showOutro()` — including cancellations and partial successes:

```typescript
// Success
showOutro(`${featureName} is ready.`);

// Cancel
showOutro('Cancelled.');

// Partial success
showOutro(`Partial feature at .features/${featureName}/`);

// Fatal error (spinner already stopped, showError already called)
// showOutro is optional here — see knowledge file for nuance
```

`showOutro()` with no argument prints `chalk.green('Done.')`.

---

## Step 6: Verify the output

Read back the file you edited and confirm:
- No `p.*` or `chalk.*` calls exist directly in the command file
- Every `await ask*()` is followed immediately by `if (isCancelled(...))`
- Every `spin.stop()` appears before any `showError()` or log call
- Every exit path ends with `showOutro()`
- No new hex colors were introduced

---

## Gotchas

- **`askFeatureName` initial value** — pass `suggested || undefined`, never `''`. An empty string pre-fills the clack field and forces the user to clear it.
- **Clack spinner has no `.text` property** — only `ora` (in `ClaudeClient`) supports in-place label updates. Use `.stop()` + a new `createSpinner()` if you need to change the label mid-operation.
- **BANNER before `p.intro()`** — `p.intro()` draws only the bottom border. `console.log(BANNER)` provides the header above. Don't swap the order.
- **`showBinahIntro()` / `showDaatIntro()` assume BANNER was already shown** — never call them as the first output in a new command session.
- **`showFeatureFolder` timing** — call it immediately after the feature name is confirmed, before starting any spinner, so the user sees the path while Claude runs.

---

## Final Step: Knowledge Sync

After completing all changes above, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `.features/features-terminal-ui/kb/KNOWLEDGE.md`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new UI functions or patterns you introduced
   - Any new phase intros or `p.note()` panels you added
   - Any conventions that changed as a result of your work
   - Any sections that no longer reflect reality — correct or remove them
   - New entries under "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
