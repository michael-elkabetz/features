import { type FeatureDoc, FEATURE_SECTIONS, FeatureFrontmatterSchema, type FlowStep } from '../schema/feature.js';
import { type CodeRef, parseRefBlock } from '../schema/ref.js';
import { type Issue, type ParseResult, failed, issue, parsed } from '../types.js';
import { parseFrontmatter } from './frontmatter.js';
import { parseMarkdown, sectionCodeBlocks, sectionListItems, sectionProse, splitSections } from './sections.js';

/** Split a flow item "Label — sub" (em dash preferred; ` - ` and `: ` accepted). */
export function parseFlowStep(item: string): FlowStep {
  for (const sep of [' — ', ' – ', ' - ', ': ']) {
    const idx = item.indexOf(sep);
    if (idx > 0) {
      return { label: item.slice(0, idx).trim(), sub: item.slice(idx + sep.length).trim() };
    }
  }
  return { label: item.trim() };
}

/** Parse a feature knowledge md file into a validated FeatureDoc. */
export function parseFeature(source: string): ParseResult<FeatureDoc> {
  const issues: Issue[] = [];

  const fm = parseFrontmatter(source);
  issues.push(...fm.issues);

  const fmResult = FeatureFrontmatterSchema.safeParse(fm.data);
  if (!fmResult.success) {
    for (const e of fmResult.error.issues) {
      issues.push(issue('bad-frontmatter', `frontmatter.${e.path.join('.')}: ${e.message}`));
    }
  }

  const tree = parseMarkdown(fm.body);
  const sections = new Map(splitSections(tree).map((s) => [s.title, s]));

  const missing = (title: string) =>
    issues.push(issue('missing-section', `Required section "## ${title}" is missing or empty`));

  // ## In a nutshell
  const nutshellSection = sections.get(FEATURE_SECTIONS.nutshell);
  const nutshell = nutshellSection ? sectionProse(nutshellSection.nodes) : '';
  if (!nutshell) missing(FEATURE_SECTIONS.nutshell);

  // ## How it works
  const howSection = sections.get(FEATURE_SECTIONS.howItWorks);
  const howItWorks = howSection ? sectionListItems(howSection.nodes).filter(Boolean) : [];
  if (howItWorks.length === 0) missing(FEATURE_SECTIONS.howItWorks);

  // ## Flow (optional)
  const flowSection = sections.get(FEATURE_SECTIONS.flow);
  const flow = flowSection ? sectionListItems(flowSection.nodes).filter(Boolean).map(parseFlowStep) : [];

  // ## Code references
  const refsSection = sections.get(FEATURE_SECTIONS.refs);
  const refs: CodeRef[] = [];
  if (!refsSection) {
    missing(FEATURE_SECTIONS.refs);
  } else {
    const blocks = sectionCodeBlocks(refsSection.nodes, 'ref');
    if (blocks.length === 0) {
      issues.push(
        issue(
          'missing-refs',
          `Section "## ${FEATURE_SECTIONS.refs}" has no \`\`\`ref blocks`,
          refsSection.line + fm.bodyOffset,
        ),
      );
    }
    for (const block of blocks) {
      const refResult = parseRefBlock(block.value, block.line + fm.bodyOffset);
      if (refResult.ok) refs.push(refResult.doc);
      else issues.push(...refResult.issues);
    }
  }

  if (issues.length > 0) return failed(issues);

  return parsed({
    frontmatter: fmResult.success ? fmResult.data : (undefined as never),
    nutshell,
    howItWorks,
    flow,
    refs,
  });
}
