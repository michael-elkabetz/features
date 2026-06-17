# Feature knowledge creation Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at `.features/features/feature-knowledge-creation.md`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

- The developer runs features create [topic] or the system triggers a deep-dive during features init.
- The CLI prompts for a topic and a feature name (or derives them automatically in batch mode).
- A "KB Service" sends the topic to Claude with a knowledge-base system prompt; Claude writes a structured KNOWLEDGE.md file.
- The system validates the output by parsing the markdown against a Zod schema, checking frontmatter fields, required sections, and code-reference blocks.
- If validation fails, the system sends the error list back to Claude for a focused repair turn (up to two retries).

## Known Files

- `src/commands/create-flow.ts` — `createFeatureFlow`: The interactive CLI flow that orchestrates the full create pipeline — topic prompt, KB generation, review loop, skill creation, and deployment.
- `src/services/kb.service.ts` — `KBService`: Sends the topic to Claude with a knowledge-base prompt and verifies the output file was created.
- `src/services/analyze.service.ts` — `AnalyzeService.runCombinedFeature`: The batch-mode equivalent — generates a knowledge file and deterministic skill in one Claude call during `features init`, with the same validate-and-repair loop.
- `src/services/skill.service.ts` — `SkillService`: Generates the companion skill file by sending the finished knowledge file to Claude with a skill-creator prompt.
- `src/spec/parse/feature-parser.ts` — `parseFeature`: Parses a feature knowledge markdown file into a validated FeatureDoc, checking frontmatter, required sections, flow steps, and code-reference blocks.
- `src/index.ts` — `createCommand`: Registers the `features create` CLI command with Commander, wiring it to the create flow.

## Implementation Steps

1. Read `.features/features/feature-knowledge-creation.md` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: Topic input → Knowledge generation → Validate & repair → Review → Skill creation → Deploy.
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at `.features/features/feature-knowledge-creation.md` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
