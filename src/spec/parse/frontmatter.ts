import matter from 'gray-matter';
import { type Issue, issue } from '../types.js';

export interface FrontmatterResult {
  /** Raw parsed YAML data (unvalidated). */
  readonly data: Record<string, unknown>;
  /** Markdown body after the frontmatter block. */
  readonly body: string;
  /** Number of lines the frontmatter block occupies (incl. delimiters), to offset positions. */
  readonly bodyOffset: number;
  readonly issues: readonly Issue[];
}

export function parseFrontmatter(source: string): FrontmatterResult {
  try {
    const parsed = matter(source);
    if (Object.keys(parsed.data).length === 0) {
      return {
        data: {},
        body: parsed.content,
        bodyOffset: 0,
        issues: [issue('missing-frontmatter', 'Document has no YAML frontmatter block')],
      };
    }
    const bodyOffset = source.length - parsed.content.length;
    const offsetLines = source.slice(0, bodyOffset).split('\n').length - 1;
    return { data: parsed.data, body: parsed.content, bodyOffset: offsetLines, issues: [] };
  } catch (e) {
    return {
      data: {},
      body: source,
      bodyOffset: 0,
      issues: [issue('bad-frontmatter', `Frontmatter is not valid YAML: ${(e as Error).message}`)],
    };
  }
}
