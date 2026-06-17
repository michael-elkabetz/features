---
id: feature-knowledge-creation
area: knowledge-authoring
name: Feature knowledge creation
summary: Generates a paired knowledge file and skill for a specific area of the codebase via an interactive flow, giving the code agent precise context for future tasks.
kind: business
status: stable
complexity: complex
related: [agent-skill-deployment, knowledge-driven-implementation, repository-analysis, manifest-compilation]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

Feature knowledge creation is the core authoring pipeline that turns a developer's description of a codebase area into two artifacts: a structured **knowledge file** (KNOWLEDGE.md) and a companion **skill** that a code agent can load later. Together, these give the agent precise context about a feature so it can work on it without re-exploring the repository from scratch.

The pipeline has two entry points. The interactive `features create` command walks the developer through a prompt-driven flow — ask a topic, pick a name, generate the knowledge, review it, then generate the skill. The automated `features init` path (used during full-repo analysis) runs the same generation logic in batch, producing a knowledge file and a deterministic skill for every discovered feature in one Claude call.

Both paths share the same validate-and-repair loop: after Claude writes the knowledge file, the system parses it against a strict schema and, if anything is wrong, sends the errors back for Claude to fix — up to two repair attempts before giving up.

## How it works

1. The developer runs `features create [topic]` or the system triggers a deep-dive during `features init`.
2. The CLI prompts for a topic and a feature name (or derives them automatically in batch mode).
3. A "KB Service" sends the topic to Claude with a knowledge-base system prompt; Claude writes a structured KNOWLEDGE.md file.
4. The system validates the output by parsing the markdown against a Zod schema, checking frontmatter fields, required sections, and code-reference blocks.
5. If validation fails, the system sends the error list back to Claude for a focused repair turn (up to two retries).
6. The developer can review and edit the knowledge file before proceeding (interactive mode only).
7. A "Skill Service" takes the finished knowledge file and asks Claude (or a deterministic renderer) to produce a paired skill file, which is then deployed to the code agent's skill directory.

## Flow

1. Topic input — CLI prompt or batch entry
2. Knowledge generation — Claude writes KNOWLEDGE.md
3. Validate & repair — Zod schema check, up to 2 retries
4. Review — Developer edits (interactive only)
5. Skill creation — Paired skill rendered from knowledge
6. Deploy — Skill copied to agent directory

## Code references

```ref
path: src/commands/create-flow.ts
lines: 42-161
symbol: createFeatureFlow
what: The interactive CLI flow that orchestrates the full create pipeline — topic prompt, KB generation, review loop, skill creation, and deployment.
note: This is the user-facing entry point for `features create`. The review loop at line 97 lets the developer edit the KB before skill generation proceeds.
sha: 7a7e0fa
```

```ref
path: src/services/kb.service.ts
lines: 8-47
symbol: KBService
what: Sends the topic to Claude with a knowledge-base prompt and verifies the output file was created.
note: The service writes to ".features/<name>/kb/KNOWLEDGE.md" and returns the path for downstream use.
sha: 7a7e0fa
```

```ref
path: src/services/analyze.service.ts
lines: 334-411
symbol: AnalyzeService.runCombinedFeature
what: The batch-mode equivalent — generates a knowledge file and deterministic skill in one Claude call during `features init`, with the same validate-and-repair loop.
note: Uses "renderAndWriteSkill" at line 381 to produce the skill deterministically from the parsed knowledge file, instead of a second Claude call.
sha: 7a7e0fa
```

```ref
path: src/services/skill.service.ts
lines: 22-91
symbol: SkillService
what: Generates the companion skill file by sending the finished knowledge file to Claude with a skill-creator prompt.
note: "ensureSkillCreator" at line 29 bootstraps the skill-creator dependency via a sparse git clone before first use.
sha: 7a7e0fa
```

```ref
path: src/spec/parse/feature-parser.ts
lines: 19-84
symbol: parseFeature
what: Parses a feature knowledge markdown file into a validated FeatureDoc, checking frontmatter, required sections, flow steps, and code-reference blocks.
note: This parser powers the validate-and-repair loop — its issues list is what gets sent back to Claude for correction.
sha: 7a7e0fa
```

```ref
path: src/index.ts
lines: 63-68
symbol: createCommand
what: Registers the `features create` CLI command with Commander, wiring it to the create flow.
sha: 7a7e0fa
```

## Related

- [Agent skill deployment](agent-skill-deployment.md)
- [Knowledge-driven implementation](knowledge-driven-implementation.md)
- [Repository analysis](repository-analysis.md)
- [Manifest compilation](manifest-compilation.md)
