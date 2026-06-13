import Parser from 'web-tree-sitter';
import { grammarFor, wasmPathFor } from '../verify/languages.js';

export type SkimMode = 'structure' | 'signatures';

let initialized = false;
const languageCache = new Map<string, Parser.Language>();

async function loadLanguage(grammar: string): Promise<Parser.Language | undefined> {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
  const cached = languageCache.get(grammar);
  if (cached) return cached;
  try {
    const lang = await Parser.Language.load(wasmPathFor(grammar));
    languageCache.set(grammar, lang);
    return lang;
  } catch {
    return undefined;
  }
}

/**
 * A "statement body" is the block containing executable statements — e.g. a
 * function/method body. We want to elide these. We do NOT want to elide class
 * or interface bodies, because they contain member declarations we still want
 * to surface.
 */
function statementBodyNode(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  // Look for body/value fields that are statement blocks (not class/interface bodies).
  for (const field of ['body', 'value'] as const) {
    const child = node.childForFieldName(field);
    if (!child) continue;
    const t = child.type;
    // statement_block (TS/JS), block (many langs) — these contain statements.
    // Exclude class_body, interface_body, object_type, etc.
    if (
      t === 'statement_block' ||
      t === 'block' ||
      t === 'compound_statement' ||
      t === 'function_body' ||
      (t.includes('block') && !t.includes('class') && !t.includes('interface') && !t.includes('object'))
    ) {
      return child;
    }
  }
  return null;
}

export async function skimFile(source: string, path: string, mode: SkimMode): Promise<string | undefined> {
  const grammar = grammarFor(path);
  if (!grammar) return undefined;
  const lang = await loadLanguage(grammar);
  if (!lang) return undefined;

  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  const lines = source.split('\n');

  const out: string[] = [];

  // Build pre-order traversal of all nodes.
  const preorder: Parser.SyntaxNode[] = [];
  {
    const stack: Parser.SyntaxNode[] = [tree.rootNode];
    while (stack.length > 0) {
      const node = stack.pop()!;
      preorder.push(node);
      for (let i = node.namedChildCount - 1; i >= 0; i--) {
        const child = node.namedChild(i);
        if (child) stack.push(child);
      }
    }
  }

  // Track ranges of statement bodies that have been elided, so we skip
  // variable declarators and other named nodes inside them.
  const elidedRanges: Array<[number, number]> = [];

  const isElided = (node: Parser.SyntaxNode): boolean =>
    elidedRanges.some(([s, e]) => node.startIndex >= s && node.endIndex <= e);

  for (const node of preorder) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode || !nameNode.text) continue;
    if (isElided(node)) continue;

    const startRow = node.startPosition.row;
    const body = statementBodyNode(node);

    if (mode === 'signatures') {
      const sig = (lines[startRow] ?? nameNode.text).trim().replace(/\s*[{(].*$/, '').trim();
      out.push(sig);
      // Elide the statement body so inner variable declarators don't leak.
      if (body) elidedRanges.push([body.startIndex, body.endIndex]);
      continue;
    }

    // structure mode
    const indent = node.startPosition.column > 0 ? '  ' : '';
    if (body) {
      const sigText = source.slice(node.startIndex, body.startIndex).trimEnd();
      out.push(`${indent}${collapseWhitespace(sigText)} { … }`);
      elidedRanges.push([body.startIndex, body.endIndex]);
    } else {
      const text = source.slice(node.startIndex, node.endIndex);
      out.push(`${indent}${collapseWhitespace(text.split('\n')[0] ?? text)}`);
    }
  }

  tree.delete();
  parser.delete();

  const deduped = out.filter((line, i) => line.trim() !== '' && line !== out[i - 1]);
  return deduped.join('\n');
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export async function skimOrRaw(source: string, path: string, mode: SkimMode, maxChars = 4000): Promise<string> {
  const skimmed = await skimFile(source, path, mode);
  if (skimmed !== undefined) return skimmed.length > maxChars ? skimmed.slice(0, maxChars) + '\n…' : skimmed;
  return source.length > maxChars ? source.slice(0, maxChars) + '\n…' : source;
}
