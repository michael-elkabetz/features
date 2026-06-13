import { dirname, join, normalize } from 'node:path';
import { collectDeclarations } from '../verify/symbol-resolver.js';
import { extractImportSpecifiers } from './import-graph.js';

export interface FileEntry {
  readonly path: string;
  readonly symbols: string[];
  readonly imports: string[];
}

export interface RepoMap {
  readonly files: FileEntry[];
  readonly symbolIndex: Map<string, string[]>;
}

const JS_TS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

function resolveSpecifier(spec: string, fromPath: string, known: Set<string>): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = normalize(join(dirname(fromPath), spec)).replace(/\\/g, '/');
  const candidates = [base, ...JS_TS_EXT.map((e) => base + e), ...JS_TS_EXT.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => known.has(c));
}

export async function buildRepoMapFromFiles(sources: Map<string, string>): Promise<RepoMap> {
  const known = new Set(sources.keys());
  const files: FileEntry[] = [];
  const symbolIndex = new Map<string, string[]>();

  for (const [path, source] of sources) {
    const decls = (await collectDeclarations(source, path)) ?? [];
    const symbols = [...new Set(decls.filter((d) => d.ancestry.length === 0).map((d) => d.name))];

    const specifiers = extractImportSpecifiers(source, path);
    const imports = [...new Set(specifiers.map((s) => resolveSpecifier(s, path, known)).filter((p): p is string => !!p))];

    files.push({ path, symbols, imports });
    for (const sym of symbols) {
      const arr = symbolIndex.get(sym) ?? [];
      arr.push(path);
      symbolIndex.set(sym, arr);
    }
  }
  return { files, symbolIndex };
}
