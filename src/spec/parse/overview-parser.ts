import { type Area, AreaSchema, OVERVIEW_SECTIONS, type OverviewDoc, OverviewFrontmatterSchema } from '../schema/overview.js';
import { type Issue, type ParseResult, failed, issue, parsed } from '../types.js';
import { parseFrontmatter } from './frontmatter.js';
import { parseMarkdown, sectionCodeBlocks, sectionProse, splitSections } from './sections.js';

/** Parse an ```area fenced block body (`key: value` lines) into an Area. */
function parseAreaBlock(body: string, baseLine: number): { area?: Area; issues: Issue[] } {
  const issues: Issue[] = [];
  const fields: Record<string, string> = {};
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const m = /^(\w+)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      issues.push(issue('malformed-area', `Unparseable line in area block: "${line.trim()}"`, baseLine + i));
      continue;
    }
    fields[m[1]!] = m[2]!.trim();
  }
  const result = AreaSchema.safeParse(fields);
  if (!result.success) {
    for (const e of result.error.issues) {
      issues.push(issue('malformed-area', `area.${e.path.join('.')}: ${e.message}`, baseLine));
    }
    return { issues };
  }
  return { area: result.data, issues };
}

/** Parse overview.md into a validated OverviewDoc. */
export function parseOverview(source: string): ParseResult<OverviewDoc> {
  const issues: Issue[] = [];

  const fm = parseFrontmatter(source);
  issues.push(...fm.issues);

  const fmResult = OverviewFrontmatterSchema.safeParse(fm.data);
  if (!fmResult.success) {
    for (const e of fmResult.error.issues) {
      issues.push(issue('bad-frontmatter', `frontmatter.${e.path.join('.')}: ${e.message}`));
    }
  }

  const tree = parseMarkdown(fm.body);
  const sections = new Map(splitSections(tree).map((s) => [s.title, s]));

  const descSection = sections.get(OVERVIEW_SECTIONS.description);
  const description = descSection ? sectionProse(descSection.nodes) : '';
  if (!description) {
    issues.push(issue('missing-section', `Required section "## ${OVERVIEW_SECTIONS.description}" is missing or empty`));
  }

  const areasSection = sections.get(OVERVIEW_SECTIONS.areas);
  const areas: Area[] = [];
  if (!areasSection) {
    issues.push(issue('missing-section', `Required section "## ${OVERVIEW_SECTIONS.areas}" is missing`));
  } else {
    const blocks = sectionCodeBlocks(areasSection.nodes, 'area');
    if (blocks.length === 0) {
      issues.push(issue('missing-areas', `Section "## ${OVERVIEW_SECTIONS.areas}" has no \`\`\`area blocks`));
    }
    const seen = new Set<string>();
    for (const block of blocks) {
      const { area, issues: blockIssues } = parseAreaBlock(block.value, block.line + fm.bodyOffset);
      issues.push(...blockIssues);
      if (area) {
        if (seen.has(area.id)) {
          issues.push(issue('duplicate-area', `Area id "${area.id}" is defined more than once`, block.line + fm.bodyOffset));
        } else {
          seen.add(area.id);
          areas.push(area);
        }
      }
    }
  }

  if (issues.length > 0) return failed(issues);

  return parsed({
    frontmatter: fmResult.success ? fmResult.data : (undefined as never),
    description,
    areas,
  });
}
