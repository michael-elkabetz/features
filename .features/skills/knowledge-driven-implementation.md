# Knowledge-driven implementation Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at `.features/features/knowledge-driven-implementation.md`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

- The user runs features implement, optionally followed by a task description.
- If a task is given directly, "default mode" fires: Claude is prompted to check .features/ for relevant knowledge before exploring.
- If no task is given, the CLI lists all discovered features (directories under .features/ that contain a knowledge file).
- The user picks a feature and types a task description.
- The feature's knowledge file is read from disk and injected into Claude's system prompt as "mandatory context."

## Known Files

- `src/commands/implement.ts` — `makeImplementCommand`: The CLI command handler that orchestrates the implement flow — resolving the feature, prompting for a task, and dispatching to the service layer.
- `src/services/feature.service.ts` — `FeatureService.executeFeature`: Reads the feature's knowledge file, builds the "mandatory context" system prompt, and calls Claude with it.
- `src/services/feature.service.ts` — `buildDefaultImplementPrompt`: Builds the system prompt for default mode — tells Claude to look for feature docs under .features/ before exploring the codebase freely.
- `src/repositories/feature.repository.ts` — `FeatureRepository`: Discovers features on disk by scanning .features/ for directories that contain a knowledge file, and reads their knowledge content.
- `src/index.ts` — `program`: Registers the "implement" CLI command with its arguments and options.

## Implementation Steps

1. Read `.features/features/knowledge-driven-implementation.md` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: Run CLI → Resolve feature → Load knowledge → Inject context → Execute.
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at `.features/features/knowledge-driven-implementation.md` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
