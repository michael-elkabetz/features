# Incremental sync Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at `.features/features/incremental-sync.md`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

- The user runs features sync, optionally choosing a model and concurrency level.
- The command reads the previously saved inventory file (_inventory.json) to get the set of "known" feature ids.
- It calls runInventory to have Claude re-scan the entire repository and produce a fresh list of features.
- The command compares the two lists: any feature id present in the new scan but absent from the old inventory is flagged as "new."
- Each new feature is deep-dived in parallel (up to the concurrency limit) using runCombinedFeature, which generates its knowledge file and skill.

## Known Files

- `src/index.ts` — `syncCommand`: Registers the `features sync` CLI command with its model and concurrency options.
- `src/commands/sync.ts` — `makeSyncCommand`: The core sync logic — reads the old inventory, re-scans, diffs the two lists, deep-dives new features in parallel, and recompiles the manifest.
- `src/services/analyze.service.ts` — `AnalyzeService.readInventory`: Reads and validates the existing `_inventory.json` file so sync knows which features are already mapped.
- `src/services/analyze.service.ts` — `AnalyzeService.runCombinedFeature`: Generates a knowledge file and skill for a single feature by sending context to Claude — called once per newly discovered feature during sync.
- `src/lib/concurrency.ts` — `mapWithConcurrency`: A worker-pool utility that runs the parallel deep-dives up to a configurable concurrency limit.

## Implementation Steps

1. Read `.features/features/incremental-sync.md` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: Read old inventory → Re-scan repository → Diff feature ids → Map new features → Compile manifest.
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at `.features/features/incremental-sync.md` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
