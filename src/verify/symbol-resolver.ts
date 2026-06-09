import Parser from 'web-tree-sitter';
import type { LineRange } from '../spec/index.js';
import { grammarFor, wasmPathFor } from './languages.js';

/** A named declaration found in a parse tree. */
export interface Declaration {
  readonly name: string;
  /** Names of enclosing named declarations, outermost first (e.g. ['BillingService']). */
  readonly ancestry: readonly string[];
  readonly range: LineRange;
}

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
 * Collect every named declaration in a source file.
 *
 * Grammar-agnostic strategy (validated across the bundled grammars): any node exposing
 * a `name` field is a declaration — classes, functions, methods, variable declarators,
 * structs, traits, interfaces, etc. This avoids per-language node-type lists.
 */
export async function collectDeclarations(source: string, path: string): Promise<Declaration[] | undefined> {
  const grammar = grammarFor(path);
  if (!grammar) return undefined;
  const lang = await loadLanguage(grammar);
  if (!lang) return undefined;

  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);

  const declarations: Declaration[] = [];
  // Iterative DFS carrying the ancestry of enclosing named declarations.
  const stack: Array<{ node: Parser.SyntaxNode; ancestry: string[] }> = [{ node: tree.rootNode, ancestry: [] }];
  while (stack.length > 0) {
    const { node, ancestry } = stack.pop()!;
    const nameNode = node.childForFieldName('name');
    let childAncestry = ancestry;
    if (nameNode && nameNode.text) {
      declarations.push({
        name: nameNode.text,
        ancestry,
        range: { start: node.startPosition.row + 1, end: node.endPosition.row + 1 },
      });
      childAncestry = [...ancestry, nameNode.text];
    }
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const child = node.namedChild(i);
      if (child) stack.push({ node: child, ancestry: childAncestry });
    }
  }

  tree.delete();
  parser.delete();
  return declarations;
}

/** Split `Outer.method` / `Outer::method` / `obj#method` into parts. */
export function splitSymbol(symbol: string): string[] {
  return symbol.split(/::|\.|#/).filter(Boolean);
}

function rangesOverlap(a: LineRange, b: LineRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Pick the declaration that best matches a (possibly qualified) symbol.
 * Scoring: qualified-ancestry matches beat bare-name matches; among equals,
 * prefer the one overlapping the authored range, then the earliest in the file.
 */
export function matchSymbol(
  declarations: readonly Declaration[],
  symbol: string,
  authoredRange?: LineRange,
): Declaration | undefined {
  const parts = splitSymbol(symbol);
  const target = parts[parts.length - 1];
  if (!target) return undefined;
  const qualifiers = parts.slice(0, -1);

  const candidates = declarations.filter((d) => d.name === target);
  if (candidates.length === 0) return undefined;

  const scored = candidates.map((d) => {
    let score = 0;
    if (qualifiers.length > 0 && qualifiers.every((q) => d.ancestry.includes(q))) score += 10;
    if (authoredRange && rangesOverlap(d.range, authoredRange)) score += 5;
    return { d, score };
  });

  scored.sort((a, b) => b.score - a.score || a.d.range.start - b.d.range.start);
  return scored[0]!.d;
}
