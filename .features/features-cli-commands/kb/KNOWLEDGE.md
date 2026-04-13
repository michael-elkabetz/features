---
description: "Use when adding a new CLI command, extending an existing command, understanding how commands are registered and wired, handling command arguments and options, or tracing how user input flows through the system. Keywords: command, Commander.js, makeCommand, factory, action, argument, option, model, isCancelled, composition root."
category: component-patterns
---

# CLI Commands

## Overview

Commands are the outermost layer of the four-tier architecture: **Commands → Services → Repositories/Clients**. They receive raw CLI input, orchestrate service calls, handle user prompts, and display results. They are the *only* layer that renders UI to the terminal — services never call `showError()` and repositories never prompt the user.

All four commands (`run`, `create`, `skill`, `update`) follow the same factory pattern: a `makeXxxCommand(deps)` function returns the async action handler that Commander.js calls. This keeps each command file focused on orchestration while the single composition root in `src/index.ts` owns all wiring.

## Core Responsibilities

**Commands SHOULD:**
- Collect and validate user input via `src/ui/prompts.ts`
- Check for cancellation after every prompt with `isCancelled()`
- Call service methods and check `result.ok` before proceeding
- Call `showError()` and `showOutro()` to render failures
- Accept a `--model` flag and pass a `ClaudeModel` to services

**Commands SHOULD NOT:**
- Contain business logic — delegate everything non-trivial to a service
- Import other commands
- Call `fs` directly (except `skill.ts`, which needs a raw existence check for legacy path support)
- Throw exceptions — let service `Result<T>` values drive flow

## Standard Structure

Every command follows the factory pattern. The factory closes over its deps; the returned function is what Commander.js calls.

The pattern for every command is:
1. Show an intro banner
2. Resolve optional arguments (prompt the user if not provided)
3. Check `isCancelled()` after each prompt — exit cleanly if cancelled
4. Call services in sequence, short-circuit on failure
5. Show final `showOutro()` on all paths

```typescript
// src/commands/run.ts — the simplest command, ideal reference shape

// 1. Typed interfaces local to the file — not exported
interface RunOptions {
  model?: string;                        // Commander gives raw string; resolve it before passing to services
}

interface RunDeps {
  featureService: FeatureService;        // Only declare deps this command actually uses
}

// 2. Factory function — index.ts calls this once to produce the action handler
export function makeRunCommand(deps: RunDeps) {
  const { featureService } = deps;       // Destructure at factory level, not inside the handler

  // 3. The actual Commander action — async, matches Commander's signature
  return async function runCommand(options: RunOptions): Promise<void> {
    showRunIntro();                      // Always show an intro

    const featuresResult = await featureService.listFeatures();
    if (!featuresResult.ok) {            // Check ok before using .value
      showError(featuresResult.error.message);
      showOutro();                       // Always call showOutro on every exit path
      return;
    }

    // Auto-select if only one feature — saves the user a prompt
    if (features.length === 1) {
      selectedName = features[0].name;
    } else {
      const result = await askSelectFeature(features);
      if (isCancelled(result)) {         // isCancelled() after EVERY prompt
        showOutro('Cancelled.');
        return;
      }
      selectedName = result;
    }

    const model: ClaudeModel = resolveModel(options.model, DEFAULT_MODEL); // Always resolve model this way

    const result = await featureService.executeFeature(selected, taskResult, model);
    if (!result.ok) {
      showError(result.error.message);   // Commands display errors; services never do
    }
    // No explicit showOutro() here — run hands off to Claude interactive mode
  };
}
```

**Key takeaways:** `resolveModel(options.model, DEFAULT_MODEL)` is the standard model resolution. `isCancelled()` after every prompt. `showOutro()` on every exit path except when handing off to interactive Claude.

## Command Registration

All commands are registered in `src/index.ts` — the single composition root. Each command follows the same registration shape:

```typescript
// src/index.ts — the composition root owns ALL wiring

// 1. Build all dependencies bottom-up (leaf → repos → services → commands)
const fs = new FilesystemRepository(process.cwd()); // rootDir fixed here for the process lifetime
const featureRepo = new FeatureRepository(fs);
const claudeClient = new ClaudeClient();
const featureService = new FeatureService(featureRepo, claudeClient);
const kbService = new KBService(fs, claudeClient);

// 2. Build commands by passing exactly the deps they declare
const runCommand = makeRunCommand({ featureService });
const createCommand = makeCreateCommand({ kbService, skillService, deployService, editorClient });

// 3. Register with Commander — arguments before options, option flags with -m shorthand
program
  .command('run', { isDefault: true })  // isDefault: true makes 'features' alone invoke this
  .description("Run a feature — implement with KB-powered Claude Code")
  .option('-m, --model <model>', 'Claude model to use (e.g., sonnet, opus, haiku)')
  .action(runCommand);                  // Pass the factory's return value directly

program
  .command('create')
  .description('Create a new feature (KB + Skill)')
  .argument('[topic]', 'What the feature should know about')  // Optional args appear as first param
  .option('-m, --model <model>', 'Claude model to use (e.g., sonnet, opus, haiku)')
  .action(createCommand);
```

**Key takeaways:** The only file that instantiates anything is `src/index.ts`. Adding a command means: create `makeXxxCommand`, add its deps to the wiring block, and register it with Commander. Never import a command factory into another command file.

## Argument Handling Pattern

When a command accepts an optional positional argument (e.g., `[feature-name]`), all four commands follow the same fallback pattern:

```typescript
// src/commands/update.ts — shows the three-way selection logic used by update, skill, create
return async function updateCommand(featureNameArg: string | undefined, options: { model?: string }) {

  // 1. Argument provided on CLI (e.g., `features update text-command`)
  if (featureNameArg) {
    const normalized = toFeatureName(featureNameArg);       // toFeatureName() adds 'features-' prefix if missing
    selected = features.find((f) => f.name === normalized);
    if (!selected) {
      showError(`Feature "${normalized}" not found. Available: ${features.map((f) => f.name).join(', ')}`);
      showOutro();
      return;
    }
    showInfo(`Using ${selected.name}`);

  // 2. Only one feature exists — auto-select and inform the user
  } else if (features.length === 1) {
    selected = features[0];
    showInfo(`Using ${selected.name}`);

  // 3. Multiple features and no argument — prompt the user
  } else {
    const result = await askSelectFeature(features);
    if (isCancelled(result)) {
      showOutro('Cancelled.');
      return;
    }
    selected = features.find((f) => f.name === result);
  }
};
```

**Key takeaways:** `toFeatureName()` normalizes the raw CLI string to a branded `FeatureName` (adds `features-` prefix if absent). Always validate the argument against the live feature list — don't assume the argument is valid. Auto-select silently when only one option exists to reduce friction.

## The `create` Command: Multi-Phase Workflow

`create` is the most complex command because it coordinates three sequential phases. The pattern of "launch Claude → check result → let user review → launch Claude again" is unique to this command and shows how to wire multi-step AI workflows:

```typescript
// src/commands/create.ts — abbreviated to show phase structure

// Phase 1 (Chochmah): KB Creation
const kbResult = await kbService.createKB(featureName, finalTopic, model);
if (!kbResult.ok) {
  handleError(kbResult.error);
  showOutro(`Partial feature at .features/${featureName}/`);  // Partial success message
  return;
}

// Between phases: let the user review and optionally edit the KB
while (true) {
  const review = await askKbReview(kbResult.value);           // Returns 'approve' | 'edit' | 'skip' | symbol
  if (isCancelled(review) || review === 'skip') {
    showInfo(`You can create the skill later with: features skill ${shortName}`);
    showOutro(`KB saved at .features/${featureName}/`);
    return;                                                    // User can defer skill creation
  }
  if (review === 'edit') {
    await editorClient.open(kbResult.value);                  // Open $EDITOR; loop back to review
    continue;
  }
  break;                                                       // 'approve' — proceed to Phase 2
}

// Phase 2 (Binah): Skill Creation
const skillResult = await skillService.createSkill({ featureName, topic: finalTopic, kbPath: kbResult.value, model });
if (!skillResult.ok) {
  handleError(skillResult.error);
  showOutro(`Skill creation failed. KB was saved.`);          // Always preserve earlier phase work
  return;
}

// Phase 3 (Da'at): Deployment
const deployResult = await deployService.deploy(featureName, skillDir);
```

**Key takeaways:** Each phase's failure message tells the user what *was* saved, not just what failed. The KB review loop uses `while (true)` + `break` — not recursion. Phases are independent service calls, not a monolithic operation.

## Model Resolution

Every command accepts `-m, --model <model>` and resolves it the same way:

```typescript
// Always this exact call — never access options.model directly in service calls
const model: ClaudeModel = resolveModel(options.model, DEFAULT_MODEL);
```

`resolveModel()` is defined in `src/types/config.ts`. It returns the raw value cast to `ClaudeModel` if it's a recognized model name, or falls back to `DEFAULT_MODEL` (`'sonnet'`, overridable via `FEATURES_MODEL` env var) if `options.model` is undefined.

## Cancellation Handling

`@clack/prompts` returns a `Symbol` when the user presses `Ctrl-C`. The `isCancelled()` helper from `src/lib/errors.ts` checks for this:

```typescript
const result = await askFeatureName(suggested);
if (isCancelled(result)) {          // Must check BEFORE using result as a string
  showOutro('Cancelled.');
  return;
}
const featureName: FeatureName = toFeatureName(result);  // Safe — only reached if not cancelled
```

This pattern appears after every `p.text()`, `p.select()`, and `p.confirm()` call. Skipping it causes TypeScript errors (symbol is not assignable to string) or runtime crashes.

## Anti-Patterns

- **Business logic in commands** — if you're doing more than "call service, check result, show error," extract it to a service.
- **Skipping `isCancelled()` after a prompt** — `@clack/prompts` returns a symbol on Ctrl-C; treating it as a string will crash at runtime.
- **Calling `showError()` from a service** — error display belongs entirely to commands. Services return `fail(code, message)` and let the command decide how to display it.
- **Importing from another command file** — commands are siblings, not a hierarchy. Shared logic goes in `src/lib/`.
- **Forgetting `showOutro()` on an error path** — every command exit path should call `showOutro()` (or let Claude take over the terminal for the `run` command).
- **Passing `options.model` raw to services** — always resolve through `resolveModel()` first to get a typed `ClaudeModel`.

## Gotchas and Edge Cases

- **The `run` command has no `showOutro()` on success** — it hands off to an interactive Claude session, so the terminal is taken over by Claude. `showOutro()` would appear before Claude's output and looks wrong.
- **`skill.ts` imports `FilesystemRepository` directly** — this is intentional: it needs to check for both the new (`kb/KNOWLEDGE.md`) and legacy (`knowledge/KNOWLEDGE.md`) KB path before handing off to the service. It's the one command that does its own existence check.
- **`toFeatureName()` is idempotent** — calling it on `"features-text-command"` returns `"features-text-command"` unchanged. Safe to call on both user-provided short names and already-prefixed names.
- **Commander passes `undefined` for optional arguments** — command handler signatures must declare args as `string | undefined`, not `string`.
- **Partial-success messaging** — when a multi-phase command fails mid-way, the `showOutro()` message must tell the user what *was* saved so they can recover manually (e.g., `features skill <name>` to retry just the skill phase).

## Related

- `src/index.ts` — composition root; where all commands are wired and registered
- `src/ui/prompts.ts` — all prompt functions and display helpers commands call
- `src/lib/errors.ts` — `isCancelled()` and `toAppError()` utilities
- `src/lib/config.ts` — `DEFAULT_MODEL` and other constants
- `src/types/config.ts` — `resolveModel()`, `ClaudeModel`, `CLAUDE_MODELS`
- `src/types/features.ts` — `toFeatureName()`, `stripFeaturePrefix()`, `FeatureName` branded type
- `.features/features-service-layer/kb/KNOWLEDGE.md` — service layer patterns (what commands delegate to)
- `.features/features-type-system/kb/KNOWLEDGE.md` — Result type, ErrorCode, domain types
