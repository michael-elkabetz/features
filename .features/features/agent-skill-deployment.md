---
id: agent-skill-deployment
area: knowledge-authoring
name: Agent skill deployment
summary: Copies generated skill files into each supported code editor's skill directory so the agent can use them during implementation tasks.
kind: business
status: stable
complexity: simple
related: [feature-knowledge-creation, knowledge-driven-implementation]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

After the system generates a skill file for a feature, it needs to land that file where each code agent actually looks. The deploy service copies the skill from its canonical home inside `.features/<name>/skill/` into three editor-specific directories: `.claude/skills/`, `.cursor/skills/`, and `.agents/skills/`. This means developers using Claude Code, Cursor, or any agent that reads the `.agents` convention all get the same skill automatically.

The deployment step is the last thing that happens in the "create" and "implement" flows. If it fails, the skill still exists in `.features/` and can be deployed manually later — the system never loses work.

## How it works

1. The user runs the `create` or `implement` command, which generates a knowledge file and then a skill file.
2. The system checks whether a skill directory exists at `.features/<featureName>/skill/`.
3. If the directory exists, the "DeployService" kicks in and iterates over three target paths: `.claude/skills/<name>`, `.cursor/skills/<name>`, and `.agents/skills/<name>`.
4. For each target, it creates the directory if missing (using "ensureDir") and then copies the entire skill folder into it.
5. If any copy fails, deployment stops and the user is told to deploy manually from the `.features/` directory.
6. On success, the CLI prints a confirmation and suggests running `features implement` to use the skill.

## Flow

1. Skill generated — SkillService
2. Check skill directory — DeployService
3. Copy to editor dirs — FilesystemRepository
4. Confirm to user — CLI prompts

## Code references

```ref
path: src/services/deploy.service.ts
lines: 10-42
symbol: DeployService
what: The service that copies a skill folder into each editor's skill directory
note: The three target paths are hard-coded at lines 18-20: ".claude", ".cursor", and ".agents". Adding a new editor means adding one line here.
sha: 7a7e0fa
```

```ref
path: src/commands/create-flow.ts
lines: 139-161
symbol: createFeatureFlow
what: The part of the create command that triggers deployment after skill generation
note: If "skillDirExists" returns false, deployment is skipped gracefully. If "deploy" fails, the user gets a manual-deploy path.
sha: 7a7e0fa
```

```ref
path: src/context/skill-template.ts
lines: 3-54
symbol: renderSkill
what: Generates the skill markdown content that gets deployed — instructions the code agent reads at task time
note: The template embeds code references and the feature's "how it works" steps so the agent has context without exploring the repo.
sha: 7a7e0fa
```

## Related

- [Feature knowledge creation](feature-knowledge-creation.md)
- [Knowledge-driven implementation](knowledge-driven-implementation.md)
