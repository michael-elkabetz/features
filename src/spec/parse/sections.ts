import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Code, Heading, List, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';

/** A `## Heading` section: its title and the block nodes until the next h2. */
export interface Section {
  readonly title: string;
  readonly nodes: readonly RootContent[];
  /** 1-indexed line of the heading in the source (post-frontmatter). */
  readonly line: number;
}

export function parseMarkdown(md: string): Root {
  return fromMarkdown(md);
}

/** Split a document into `## `-level sections; content before the first h2 is ignored. */
export function splitSections(tree: Root): Section[] {
  const sections: Section[] = [];
  let current: { title: string; nodes: RootContent[]; line: number } | undefined;

  for (const node of tree.children) {
    if (node.type === 'heading' && (node as Heading).depth === 2) {
      if (current) sections.push(current);
      current = {
        title: phrasingToString((node as Heading).children).trim(),
        nodes: [],
        line: node.position?.start.line ?? 1,
      };
      continue;
    }
    current?.nodes.push(node);
  }
  if (current) sections.push(current);
  return sections;
}

/** Render inline (phrasing) content back to plain text. */
export function phrasingToString(children: readonly PhrasingContent[]): string {
  let out = '';
  for (const child of children) {
    switch (child.type) {
      case 'text':
      case 'inlineCode':
        out += child.value;
        break;
      case 'emphasis':
      case 'strong':
      case 'delete':
      case 'link':
        out += phrasingToString(child.children);
        break;
      case 'break':
        out += ' ';
        break;
      default:
        break;
    }
  }
  return out;
}

/** Concatenate a section's paragraphs into prose, preserving blank lines between them. */
export function sectionProse(nodes: readonly RootContent[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.type === 'paragraph') {
      parts.push(phrasingToString((node as Paragraph).children).trim());
    }
  }
  return parts.join('\n\n').trim();
}

/** Extract the items of the first list in a section as plain strings. */
export function sectionListItems(nodes: readonly RootContent[]): string[] {
  const list = nodes.find((n): n is List => n.type === 'list');
  if (!list) return [];
  return list.children.map((item) => {
    const para = item.children.find((c): c is Paragraph => c.type === 'paragraph');
    return para ? phrasingToString(para.children).trim() : '';
  });
}

/** All fenced code blocks of a given language in a section, with their source lines. */
export function sectionCodeBlocks(
  nodes: readonly RootContent[],
  lang: string,
): Array<{ value: string; line: number }> {
  const blocks: Array<{ value: string; line: number }> = [];
  for (const node of nodes) {
    if (node.type === 'code' && (node as Code).lang === lang) {
      blocks.push({
        value: (node as Code).value,
        // +1: content starts on the line after the opening fence
        line: (node.position?.start.line ?? 0) + 1,
      });
    }
  }
  return blocks;
}
