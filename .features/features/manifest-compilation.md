---
id: manifest-compilation
area: data-pipeline
name: Manifest compilation
summary: Parses markdown knowledge files, validates them against a Zod schema, verifies every code reference against the live repo, and produces a single manifest.json for the web viewer.
kind: technical
status: stable
complexity: complex
related: [web-viewer, repository-analysis, feature-knowledge-creation]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

Manifest compilation is the build step that turns human-authored markdown knowledge files into a single `manifest.json` the web viewer can load. It reads every feature file from the `.features/` directory, validates its structure (frontmatter, sections, code references) against strict Zod schemas, then checks each code reference against the actual source files in the repository — using Tree-sitter parsing and grep as a fallback — to confirm the referenced symbols still exist where they claim to.

The compiler also "heals" references that drifted: if a function moved to a different line, the compiler finds it at its new location and updates the range automatically. References that can't be found at all are flagged as "stale." The final output is a typed JSON manifest containing every feature's metadata, prose sections, verified code snippets, and staleness information.

## How it works

1. The "compile" method on CompileService is called, which first delegates to ValidateService to parse and validate all markdown files.
2. ValidateService reads the overview file and every feature markdown, running each through a Zod-backed parser that checks frontmatter fields and required sections ("In a nutshell," "How it works," "Code references").
3. Cross-document validation runs next — checking that referenced area ids exist in the overview and that related feature ids point to real features.
4. For each feature's code references, the compiler reads the referenced source file and runs a two-pass verification: first Tree-sitter tries to resolve the declared symbol to its actual line range, then a word-boundary grep acts as fallback.
5. If the symbol is found but at a different location, the reference is "healed" to the new range; if not found at all, it is marked "stale" with a reason (file missing, symbol not found, or lines out of range).
6. The compiler assembles all verified features, their extracted code snippets, and repository-level stats into a Manifest object, validates it against ManifestSchema, and writes it as `manifest.json`.

## Flow

1. Validate — ValidateService parses all markdown
2. Cross-check — validateProject verifies ids
3. Verify refs — Tree-sitter + grep per reference
4. Heal or stale — auto-correct drifted ranges
5. Assemble — build typed Manifest object
6. Write — serialize to manifest.json

## Code references

```ref
path: src/services/compile.service.ts
lines: 31-136
symbol: CompileService
what: The main compilation service that orchestrates validation, reference verification, and manifest assembly
note: The "compile" method is the entry point. It delegates validation to ValidateService, then loops through each feature's refs calling "compileRef" for verification.
sha: 7a7e0fa
```

```ref
path: src/services/compile.service.ts
lines: 138-182
symbol: CompileService.compileRef
what: Verifies a single code reference against the live repo and produces a ManifestRef with provenance and snippet
note: Handles the file-missing case inline, then delegates to "verifyRef" and "extractSnippet" for the actual symbol resolution.
sha: 7a7e0fa
```

```ref
path: src/verify/verifier.ts
lines: 57-145
symbol: verifyRef
what: Two-pass reference verifier — Tree-sitter first, grep fallback — that determines whether a code reference is verified, healed, or stale
note: The "stillAccurate" helper decides whether the authored range is close enough to the resolved declaration to count as verified vs. needing healing.
sha: 7a7e0fa
```

```ref
path: src/services/validate.service.ts
lines: 28-97
symbol: ValidateService
what: Reads and parses all markdown files from the .features directory, validating each against Zod schemas
note: The "validateAll" method returns a ValidatedProject containing the parsed overview, a map of feature docs, and any cross-document issues.
sha: 7a7e0fa
```

```ref
path: src/spec/schema/manifest.ts
lines: 14-31
symbol: ManifestRefSchema
what: Zod schema defining the shape of a single code reference in the compiled manifest, including provenance and staleness fields
sha: 7a7e0fa
```

```ref
path: src/spec/schema/feature.ts
lines: 42-50
symbol: FeatureDocSchema
what: Zod schema defining the expected structure of a parsed feature knowledge file — frontmatter, nutshell, how-it-works, flow, and refs
sha: 7a7e0fa
```

## Related

- [Web Viewer](web-viewer.md)
- [Repository analysis](repository-analysis.md)
- [Feature knowledge creation](feature-knowledge-creation.md)
