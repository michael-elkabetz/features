import { extname } from 'node:path';

const JS_TS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const PY = new Set(['.py']);
const GO = new Set(['.go']);

const JS_IMPORT = /(?:import\s[^'"]*?from\s*|import\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
const PY_FROM = /^\s*from\s+([\w.]+)\s+import/gm;
const PY_IMPORT = /^\s*import\s+([\w.]+)/gm;
const GO_IMPORT = /"([^"]+)"/g;

export function extractImportSpecifiers(source: string, path: string): string[] {
  const ext = extname(path).toLowerCase();
  const found = new Set<string>();
  const push = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) if (m[1]) found.add(m[1]);
  };
  if (JS_TS.has(ext)) push(JS_IMPORT);
  else if (PY.has(ext)) { push(PY_FROM); push(PY_IMPORT); }
  else if (GO.has(ext)) {
    const block = source.match(/import\s*\(([\s\S]*?)\)/);
    if (block) { const re = new RegExp(GO_IMPORT); let m; while ((m = re.exec(block[1]!)) !== null) found.add(m[1]!); }
    push(/import\s+"([^"]+)"/g);
  }
  return [...found];
}
