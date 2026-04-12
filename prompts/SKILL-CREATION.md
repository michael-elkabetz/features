# Features CLI — Skill Creation Context

You are being invoked as part of an automated pipeline. The user's prompt contains everything you need: the topic, the knowledge file path, and where to place the output.

## Non-Interactive Mode

- Do NOT interview the user or ask clarifying questions. All context is in the knowledge file.
- Do NOT create test cases or evaluation sets.
- Do NOT run evaluations, benchmarks, or the eval viewer.
- Do NOT run description optimization loops.
- Do NOT ask for feedback or approval mid-process.

## What To Do

1. Read the knowledge file specified in the user prompt — it contains deep codebase-specific patterns, conventions, and architecture insights.
2. Create a complete skill based on that knowledge. The skill should encode those patterns as actionable instructions that Claude can follow when working in this codebase.
3. Place ALL output files (SKILL.md, scripts/, agents/, references/, and any other resources) inside the exact folder path specified in the user prompt.

## CRITICAL — Generated SKILL.md Structure

The SKILL.md you generate will be invoked as a slash command by Claude Code. It MUST follow this exact structure to work properly:

### 1. The SKILL.md MUST start with a mandatory preamble

The very first section of every generated SKILL.md must be:

```markdown
# [Skill Name]

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:
1. Read the knowledge file at `[knowledge file path]`
2. Use ONLY the patterns, conventions, and architecture described in that file
3. Do NOT explore, scan, or investigate the codebase to understand it — the knowledge file already contains everything you need
4. Do NOT use Glob, Grep, or subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them or when the knowledge file tells you to reference them
```

This preamble is non-negotiable. Without it, Claude will ignore the knowledge and explore the codebase from scratch, defeating the entire purpose of features.

### 2. Embed key knowledge inline

After the preamble, the SKILL.md should include a condensed summary of the most critical patterns from the knowledge file — file locations, naming conventions, required structures, and the step-by-step process. This provides immediate context even before Claude reads the full knowledge file.

### 3. Step-by-step instructions

The rest of the skill should be concrete, step-by-step instructions that reference specific patterns from the knowledge. Each step should say exactly which files to read, what to create, and what patterns to follow.

## Knowledge Feedback Loop — CRITICAL

Every skill you generate MUST include a final step called **"Knowledge Sync"** at the end of its SKILL.md. This step ensures the knowledge file stays accurate after the skill makes changes to the codebase.

The generated SKILL.md must end with a section like this:

```markdown
## Final Step: Knowledge Sync

After completing all changes above, update the knowledge file to reflect the current state of the codebase:

1. Re-read the knowledge file at `[knowledge file path]`
2. Scan the files you just created or modified
3. Update the knowledge file with:
   - Any new patterns introduced by your changes
   - Any conventions that changed as a result of your work
   - Any sections that no longer reflect reality — remove or correct them
   - New entries in "Related" or "Gotchas" if your changes revealed edge cases
4. Do NOT append blindly — revise existing sections in place so the knowledge file reads as a coherent, up-to-date document
5. Keep the file under 500 lines
```

The exact knowledge file path will be available from the user prompt. Make sure the generated skill references it correctly. This feedback loop is what keeps features alive — without it, the knowledge drifts from reality after every use.

## Focus

Jump directly to the "Write Draft Skill" phase of your workflow. Skip everything before and after it. Just produce the skill.
