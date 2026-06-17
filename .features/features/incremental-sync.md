---
id: incremental-sync
area: codebase-intelligence
name: Incremental sync
summary: Detects what changed since the last analysis and re-maps only newly discovered features, avoiding a full re-scan of the entire repository.
kind: business
status: stable
complexity: moderate
related: [repository-analysis, manifest-compilation, cli]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

Incremental sync lets you update your feature knowledge without re-analyzing every feature from scratch. When you run the `features sync` command, it reads the existing inventory of known features, asks Claude to re-scan the repository for a fresh inventory, and then compares the two lists. Only features that appear in the new scan but not in the old one get deep-dived — everything already mapped is left untouched.

This means a sync after adding a new module to your codebase takes minutes instead of the much longer full init, because the AI only writes knowledge files for the genuinely new features it discovers.

## How it works

1. The user runs `features sync`, optionally choosing a model and concurrency level.
2. The command reads the previously saved inventory file (`_inventory.json`) to get the set of "known" feature ids.
3. It calls `runInventory` to have Claude re-scan the entire repository and produce a fresh list of features.
4. The command compares the two lists: any feature id present in the new scan but absent from the old inventory is flagged as "new."
5. Each new feature is deep-dived in parallel (up to the concurrency limit) using `runCombinedFeature`, which generates its knowledge file and skill.
6. After all new features are mapped, the manifest is recompiled so the web viewer picks up the additions.
7. Features that disappeared from the new scan are warned about but not deleted, keeping the process safe and non-destructive.

## Flow

1. Read old inventory — Load `_inventory.json`
2. Re-scan repository — Claude produces fresh feature list
3. Diff feature ids — Filter to only new entries
4. Map new features — Parallel deep-dives via Claude
5. Compile manifest — Rebuild `manifest.json`

## Code references

```ref
path: src/index.ts
lines: 81-86
symbol: syncCommand
what: Registers the `features sync` CLI command with its model and concurrency options.
sha: 7a7e0fa
```

```ref
path: src/commands/sync.ts
lines: 20-88
symbol: makeSyncCommand
what: The core sync logic — reads the old inventory, re-scans, diffs the two lists, deep-dives new features in parallel, and recompiles the manifest.
sha: 7a7e0fa
```

```ref
path: src/services/analyze.service.ts
lines: 429-441
symbol: AnalyzeService.readInventory
what: Reads and validates the existing `_inventory.json` file so sync knows which features are already mapped.
sha: 7a7e0fa
```

```ref
path: src/services/analyze.service.ts
lines: 335-374
symbol: AnalyzeService.runCombinedFeature
what: Generates a knowledge file and skill for a single feature by sending context to Claude — called once per newly discovered feature during sync.
sha: 7a7e0fa
```

```ref
path: src/lib/concurrency.ts
lines: 1-21
symbol: mapWithConcurrency
what: A worker-pool utility that runs the parallel deep-dives up to a configurable concurrency limit.
sha: 7a7e0fa
```

## Related

- [Repository analysis](repository-analysis.md)
- [Manifest compilation](manifest-compilation.md)
- [CLI](cli.md)
