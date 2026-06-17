---
id: cli
area: user-interfaces
name: CLI
summary: The command-line surface that registers every user-facing command (implement, create, init, sync, serve) and wires each one to its backing service.
kind: technical
status: stable
complexity: complex
related: [web-viewer, repository-analysis, feature-knowledge-creation, knowledge-driven-implementation]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

The CLI is the main way a developer interacts with this tool. It is a single executable called `features` that exposes five sub-commands: `implement`, `create`, `init`, `sync`, and `serve`.

`implement` runs Claude Code for a task and tells it to use feature knowledge when relevant. `create` makes a reusable Feature directory with a Knowledge file and Skill. `init` analyzes the repo and builds browsable knowledge under `.features/`. `sync` scans for newly discovered features and maps only the new ones. `serve` starts the web viewer, with optional live re-analysis.

The CLI layer uses Commander for command declarations and thin command modules for behavior. All clients, repositories, and services are constructed once in `src/index.ts`, then passed into command factory functions like `makeImplementCommand` and `makeInitCommand`.

## How it works

1. The user runs `features <command>` in their terminal. Node executes `src/index.ts`.
2. The entry point creates the filesystem repository, feature repository, Claude/Git/Editor clients, and services.
3. The entry point calls each command factory and registers the resulting handler with Commander.
4. Commander parses arguments and flags like `--model`, `--feature`, `--concurrency`, `--port`, and `--live`.
5. The matched handler runs and delegates real work to services.
6. Interactive prompts and progress UI are rendered through `src/ui/prompts.ts`.

## Commands

- `features implement [prompt...]` — run Claude Code for a task. With no prompt, select a created Feature and enter the task interactively.
- `features create [topic]` — create `.features/<feature-name>/kb/KNOWLEDGE.md` and `.features/<feature-name>/skill/SKILL.md`, then deploy the Skill to agent skill directories.
- `features init` — discover repo features, analyze them, cache unchanged features, and compile `.features/manifest.json`.
- `features sync` — read the existing inventory, scan again, map only newly discovered features, warn on missing old features, and recompile the manifest.
- `features serve` — serve the generated viewer on port 4747 by default; `--live` enables browser-triggered re-analysis.

## Flow

1. Parse command — Commander
2. Wire dependencies — `src/index.ts`
3. Execute handler — command module
4. Show progress/prompts — `src/ui/prompts.ts`
5. Return result — exit code or long-running server

## Code references

```ref
path: src/index.ts
lines: 51-96
symbol: program
what: Registers implement, create, init, sync, and serve with Commander, including arguments, flags, descriptions, and default help behavior.
note: This is the user-facing CLI surface — any new command or flag starts here.
sha: 7a7e0fa
```

```ref
path: src/index.ts
lines: 27-49
symbol: cwd
what: Constructs clients, repositories, and services, then passes them into command factories.
note: Single-site dependency wiring — services are not constructed inside command handlers.
sha: 7a7e0fa
```

```ref
path: src/commands/implement.ts
lines: 21-98
symbol: makeImplementCommand
what: Factory for the implement command — resolves the model, runs prompt mode directly, or lets the user select an existing Feature and enter a task.
note: Prompt mode can offer to create a Feature from the task after Claude finishes.
sha: 7a7e0fa
```

```ref
path: src/commands/create.ts
lines: 3-7
symbol: makeCreateCommand
what: Factory for the create command — delegates to the shared create-feature flow.
sha: 7a7e0fa
```

```ref
path: src/commands/init.ts
lines: 95-285
symbol: makeInitCommand
what: Factory for the init command — migrates old `.code-explain/` data, discovers inventory, maps the repo, analyzes features with concurrency and cache support, and compiles the manifest.
note: Handles pause/resume and rate-limit retry prompts.
sha: 7a7e0fa
```

```ref
path: src/commands/sync.ts
lines: 20-88
symbol: makeSyncCommand
what: Factory for the sync command — compares a fresh inventory to the existing one, analyzes only new features, and recompiles the manifest.
note: Removed features are reported but not deleted.
sha: 7a7e0fa
```

```ref
path: src/commands/serve.ts
lines: 19-38
symbol: makeServeCommand
what: Factory for the serve command — starts either the static viewer or live server.
note: `--live` switches to `LiveServerService` and uses `--model` for browser-triggered analysis.
sha: 7a7e0fa
```

```ref
path: src/ui/prompts.ts
lines: 9-20
symbol: showIntro
what: Renders the ASCII banner and step headers that appear when users run interactive commands.
note: Uses chalk for color and @clack/prompts for structured terminal UI.
sha: 7a7e0fa
```

## Related

- [Web Viewer](web-viewer.md)
- [Repository analysis](repository-analysis.md)
- [Feature knowledge creation](feature-knowledge-creation.md)
- [Knowledge-driven implementation](knowledge-driven-implementation.md)
