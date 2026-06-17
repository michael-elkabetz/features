# CLI Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at `.features/features/cli.md`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

- The user runs features <command> in their terminal. Node executes the entry-point src/index.ts.
- The entry-point creates every client (Claude, Git, Editor), repository, and service the app needs, then calls each command's factory to produce a handler function.
- Commander matches the typed sub-command (e.g. init, serve) to the registered handler and parses any flags like --model or --concurrency.
- The matched handler runs. For example, init discovers features via the "AnalyzeService", shows progress with spinners and progress bars, and optionally compiles a manifest.
- Interactive prompts (built on the @clack/prompts library) collect user input when needed — for instance, choosing a model or naming a feature.

## Known Files

- `src/index.ts` — `program`: Registers every CLI command (init, create, implement, sync, serve) with Commander, defining flags, arguments, and descriptions.
- `src/index.ts` — `cwd`: Constructs all clients, repositories, and services, then passes them into each command factory.
- `src/commands/init.ts` — `makeInitCommand`: Factory for the init command — runs inventory discovery, handles rate-limit retries and caching, and orchestrates the full analysis pipeline.
- `src/commands/serve.ts` — `makeServeCommand`: Factory for the serve command — starts either a static or live HTTP server for browsing feature knowledge.
- `src/commands/create.ts` — `makeCreateCommand`: Factory for the create command — delegates immediately to the interactive create-feature flow.
- `src/ui/prompts.ts` — `showIntro`: Renders the ASCII banner and step headers that appear when users run interactive commands.

## Implementation Steps

1. Read `.features/features/cli.md` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: Parse command → Wire dependencies → Execute handler → Show progress → Return result.
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at `.features/features/cli.md` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
