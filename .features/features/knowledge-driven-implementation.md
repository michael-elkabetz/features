---
id: knowledge-driven-implementation
area: ai-assisted-implementation
name: Knowledge-driven implementation
summary: Feeds stored feature knowledge and skills to Claude so it can implement code changes without re-exploring the codebase.
kind: business
status: stable
complexity: moderate
related: [feature-knowledge-creation, agent-skill-deployment, cli, repository-analysis]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

When a developer asks Claude to make a code change, it normally has to explore the repository first — reading files, grepping for patterns, figuring out conventions. Knowledge-driven implementation short-circuits that. It loads the previously written knowledge file (and optional skill) for the relevant feature and injects them directly into Claude's system prompt, so the AI already "knows" the codebase architecture and can jump straight to editing code.

There are two modes. In "targeted" mode, the user picks a specific feature from the `.features/` directory and describes a task; Claude receives that feature's knowledge file as mandatory context. In "default" mode, the user just describes what they want and Claude is told to look for relevant feature docs on its own before falling back to normal exploration.

## How it works

1. The user runs `features implement`, optionally followed by a task description.
2. If a task is given directly, "default mode" fires: Claude is prompted to check `.features/` for relevant knowledge before exploring.
3. If no task is given, the CLI lists all discovered features (directories under `.features/` that contain a knowledge file).
4. The user picks a feature and types a task description.
5. The feature's knowledge file is read from disk and injected into Claude's system prompt as "mandatory context."
6. If the feature also has a deployed skill file, the task is prefixed with the skill's slash-command (e.g. `/features-cli deploy skill`).
7. Claude Code executes, skipping exploration and following the patterns described in the knowledge.

## Flow

1. Run CLI — User invokes `features implement`
2. Resolve feature — List or skip to default mode
3. Load knowledge — Read the feature's knowledge file from disk
4. Inject context — Append knowledge to Claude's system prompt
5. Execute — Claude implements the task with full context

## Code references

```ref
path: src/commands/implement.ts
lines: 20-99
symbol: makeImplementCommand
what: The CLI command handler that orchestrates the implement flow — resolving the feature, prompting for a task, and dispatching to the service layer.
note: Two paths diverge at line 30: a free-form prompt goes to "implementTask" (default mode), while a selected feature goes to "executeFeature" (targeted mode).
sha: 7a7e0fa
```

```ref
path: src/services/feature.service.ts
lines: 27-57
symbol: FeatureService.executeFeature
what: Reads the feature's knowledge file, builds the "mandatory context" system prompt, and calls Claude with it.
note: The knowledge is injected via "appendSystemPrompt" so it layers on top of Claude's default instructions. If a skill exists, the user prompt is prefixed with a slash-command like "/feature-name".
sha: 7a7e0fa
```

```ref
path: src/services/feature.service.ts
lines: 60-70
symbol: buildDefaultImplementPrompt
what: Builds the system prompt for default mode — tells Claude to look for feature docs under .features/ before exploring the codebase freely.
sha: 7a7e0fa
```

```ref
path: src/repositories/feature.repository.ts
lines: 6-60
symbol: FeatureRepository
what: Discovers features on disk by scanning .features/ for directories that contain a knowledge file, and reads their knowledge content.
note: Supports multiple legacy paths for the knowledge file ("KNOWLEDGE.md", "knowledge.md", nested under "kb/" or "knowledge/").
sha: 7a7e0fa
```

```ref
path: src/index.ts
lines: 56-61
symbol: program
what: Registers the "implement" CLI command with its arguments and options.
sha: 7a7e0fa
```

## Related

- [Feature knowledge creation](feature-knowledge-creation.md)
- [Agent skill deployment](agent-skill-deployment.md)
- [CLI](cli.md)
- [Repository analysis](repository-analysis.md)
