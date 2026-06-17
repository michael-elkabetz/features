# Manifest compilation Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at `.features/features/manifest-compilation.md`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

- The "compile" method on CompileService is called, which first delegates to ValidateService to parse and validate all markdown files.
- ValidateService reads the overview file and every feature markdown, running each through a Zod-backed parser that checks frontmatter fields and required sections ("In a nutshell," "How it works," "Code references").
- Cross-document validation runs next — checking that referenced area ids exist in the overview and that related feature ids point to real features.
- For each feature's code references, the compiler reads the referenced source file and runs a two-pass verification: first Tree-sitter tries to resolve the declared symbol to its actual line range, then a word-boundary grep acts as fallback.
- If the symbol is found but at a different location, the reference is "healed" to the new range; if not found at all, it is marked "stale" with a reason (file missing, symbol not found, or lines out of range).

## Known Files

- `src/services/compile.service.ts` — `CompileService`: The main compilation service that orchestrates validation, reference verification, and manifest assembly
- `src/services/compile.service.ts` — `CompileService.compileRef`: Verifies a single code reference against the live repo and produces a ManifestRef with provenance and snippet
- `src/verify/verifier.ts` — `verifyRef`: Two-pass reference verifier — Tree-sitter first, grep fallback — that determines whether a code reference is verified, healed, or stale
- `src/services/validate.service.ts` — `ValidateService`: Reads and parses all markdown files from the .features directory, validating each against Zod schemas
- `src/spec/schema/manifest.ts` — `ManifestRefSchema`: Zod schema defining the shape of a single code reference in the compiled manifest, including provenance and staleness fields
- `src/spec/schema/feature.ts` — `FeatureDocSchema`: Zod schema defining the expected structure of a parsed feature knowledge file — frontmatter, nutshell, how-it-works, flow, and refs

## Implementation Steps

1. Read `.features/features/manifest-compilation.md` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: Validate → Cross-check → Verify refs → Heal or stale → Assemble → Write.
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at `.features/features/manifest-compilation.md` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
