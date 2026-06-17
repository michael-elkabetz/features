# Repository analysis Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at `.features/features/repository-analysis.md`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

- The user runs features init, which triggers the init command handler.
- The system asks git for all tracked files, then "fingerprints" them by their modification times to check for a cached repo map.
- If no valid cache exists, Tree-sitter parses each source file to extract top-level symbol declarations and import specifiers, building a RepoMap of files, symbols, and an import graph.
- The repo map is serialized into a text context block and sent to Claude alongside a system prompt, kicking off "Pass 1" — inventory discovery — where Claude identifies the repository's areas and features and writes an _inventory.json and overview.md.
- The inventory output is validated against a Zod schema; if it fails, a focused repair turn asks Claude to fix the errors (up to two retries).

## Known Files

- `src/commands/init.ts` — `makeInitCommand`: CLI entry point that orchestrates the two-pass analysis flow — inventory discovery then per-feature deep-dives.
- `src/services/analyze.service.ts` — `AnalyzeService.runInventory`: Pass 1 — sends the repo map context to Claude with the inventory system prompt, then validates and optionally repairs the output.
- `src/services/analyze.service.ts` — `AnalyzeService.runCombinedFeature`: Pass 2 — deep-dives one feature to produce both the knowledge file and the implementation skill in a single Claude call.
- `src/codemap/repo-map.ts` — `buildRepoMapFromFiles`: Core repo-map builder — parses each source file with Tree-sitter to collect symbol declarations and resolved import edges, then indexes symbols by name.
- `src/codemap/repo-map-loader.ts` — `buildRepoMap`: Loads tracked files from disk, filters out ignored directories and unsupported languages, and feeds them to the repo-map builder.
- `src/context/context-builder.ts` — `buildInventoryContext`: Converts the repo map into a text block that Claude receives as pre-computed context, so it can discover features without scanning the filesystem from scratch.

## Implementation Steps

1. Read `.features/features/repository-analysis.md` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: Map repository → Discover features → Validate inventory → Deep-dive each feature → Validate & repair.
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at `.features/features/repository-analysis.md` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
