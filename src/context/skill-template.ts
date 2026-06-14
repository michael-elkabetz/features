import type { FeatureDoc } from '../spec/index.js';

export function renderSkill(doc: FeatureDoc, featureFilePath: string): string {
  const { name } = doc.frontmatter;

  const summaryBullets = doc.howItWorks.slice(0, 5).map((s) => `- ${s}`).join('\n');

  const knownFiles = doc.refs
    .map((r) => `- \`${r.path}\`${r.symbol ? ` — \`${r.symbol}\`` : ''}: ${r.what}`)
    .join('\n');

  return `# ${name} Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at \`${featureFilePath}\`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

${summaryBullets}

## Known Files

${knownFiles}

## Implementation Steps

1. Read \`${featureFilePath}\` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: ${doc.flow.map((f) => f.label).join(' → ') || 'see the knowledge file'}.
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at \`${featureFilePath}\` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
`;
}
