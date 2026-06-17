---
id: repository-analysis
area: codebase-intelligence
name: Repository analysis
summary: Scans a codebase using Tree-sitter and git to build a repo map of files, symbols, and import graphs, then uses Claude to discover and categorize the repo's business and technical features.
kind: business
status: stable
complexity: complex
related: [incremental-sync, manifest-compilation, cli]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

Repository analysis is the main intelligence-gathering pass that turns a raw codebase into structured feature knowledge. It works in two phases: first it builds a "repo map" — an AI-free index of every source file's exported symbols and import relationships, powered by Tree-sitter parsers — then it hands that map to Claude, which reads the code, discovers the repository's distinct features, and writes a knowledge file and implementation skill for each one.

The result is a machine-readable inventory of features (with areas, summaries, and complexity ratings) plus per-feature deep-dive markdown files that explain what each feature does, how it works, and where the key code lives. This is the foundation that every other part of the system — the web viewer, incremental sync, knowledge-driven implementation — builds on.

## How it works

1. The user runs `features init`, which triggers the init command handler.
2. The system asks git for all tracked files, then "fingerprints" them by their modification times to check for a cached repo map.
3. If no valid cache exists, Tree-sitter parses each source file to extract top-level symbol declarations and import specifiers, building a `RepoMap` of files, symbols, and an import graph.
4. The repo map is serialized into a text context block and sent to Claude alongside a system prompt, kicking off "Pass 1" — inventory discovery — where Claude identifies the repository's areas and features and writes an `_inventory.json` and `overview.md`.
5. The inventory output is validated against a Zod schema; if it fails, a focused repair turn asks Claude to fix the errors (up to two retries).
6. In "Pass 2," each discovered feature is sent to Claude concurrently (default concurrency of 4) for a combined deep-dive that produces both a feature knowledge file (`features/<id>.md`) and a paired implementation skill (`skills/<id>.md`).
7. Each deep-dive output goes through the same validate-and-repair loop, and completed features are tracked in a cache so interrupted runs can resume without re-analyzing finished features.

## Flow

1. Map repository — Tree-sitter + git
2. Discover features — Claude inventory pass
3. Validate inventory — Zod schema check
4. Deep-dive each feature — Claude with repo context
5. Validate & repair — Auto-fix loop

## Code references

```ref
path: src/commands/init.ts
lines: 95-172
symbol: makeInitCommand
what: CLI entry point that orchestrates the two-pass analysis flow — inventory discovery then per-feature deep-dives.
note: Handles caching, pause/resume on Ctrl+C, and rate-limit retries. Calls "analyzeService.runInventory" for pass 1 and "analyzeService.runCombinedFeature" for pass 2.
sha: 7a7e0fa
```

```ref
path: src/services/analyze.service.ts
lines: 158-231
symbol: AnalyzeService.runInventory
what: Pass 1 — sends the repo map context to Claude with the inventory system prompt, then validates and optionally repairs the output.
note: Constructs the user prompt with "budgetHint" and "featureCountHint" to steer Claude toward the right number of features for the repo size.
sha: 7a7e0fa
```

```ref
path: src/services/analyze.service.ts
lines: 334-349
symbol: AnalyzeService.runCombinedFeature
what: Pass 2 — deep-dives one feature to produce both the knowledge file and the implementation skill in a single Claude call.
note: Uses "buildFeatureContext" to pre-feed skimmed code for the most relevant files, reducing Claude's need to explore the repo itself.
sha: 7a7e0fa
```

```ref
path: src/codemap/repo-map.ts
lines: 25-45
symbol: buildRepoMapFromFiles
what: Core repo-map builder — parses each source file with Tree-sitter to collect symbol declarations and resolved import edges, then indexes symbols by name.
sha: 7a7e0fa
```

```ref
path: src/codemap/repo-map-loader.ts
lines: 13-27
symbol: buildRepoMap
what: Loads tracked files from disk, filters out ignored directories and unsupported languages, and feeds them to the repo-map builder.
note: Skips files larger than 256 KB and files without a matching Tree-sitter grammar.
sha: 7a7e0fa
```

```ref
path: src/context/context-builder.ts
lines: 18-29
symbol: buildInventoryContext
what: Converts the repo map into a text block that Claude receives as pre-computed context, so it can discover features without scanning the filesystem from scratch.
sha: 7a7e0fa
```

## Related

- [Incremental sync](incremental-sync.md)
- [Manifest compilation](manifest-compilation.md)
- [CLI](cli.md)
