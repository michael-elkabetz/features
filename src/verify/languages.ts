import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** Map a file extension to its tree-sitter-wasms grammar name and viewer lang tag. */
interface LanguageInfo {
  /** Grammar file: tree-sitter-<grammar>.wasm */
  readonly grammar: string;
  /** Language tag for syntax highlighting in the viewer. */
  readonly tag: string;
}

const EXTENSION_MAP: Record<string, LanguageInfo> = {
  '.ts': { grammar: 'typescript', tag: 'ts' },
  '.mts': { grammar: 'typescript', tag: 'ts' },
  '.cts': { grammar: 'typescript', tag: 'ts' },
  '.tsx': { grammar: 'tsx', tag: 'tsx' },
  '.js': { grammar: 'javascript', tag: 'js' },
  '.mjs': { grammar: 'javascript', tag: 'js' },
  '.cjs': { grammar: 'javascript', tag: 'js' },
  '.jsx': { grammar: 'javascript', tag: 'jsx' },
  '.py': { grammar: 'python', tag: 'python' },
  '.go': { grammar: 'go', tag: 'go' },
  '.rs': { grammar: 'rust', tag: 'rust' },
  '.java': { grammar: 'java', tag: 'java' },
  '.rb': { grammar: 'ruby', tag: 'ruby' },
  '.php': { grammar: 'php', tag: 'php' },
  '.cs': { grammar: 'c_sharp', tag: 'csharp' },
  '.c': { grammar: 'c', tag: 'c' },
  '.h': { grammar: 'c', tag: 'c' },
  '.cpp': { grammar: 'cpp', tag: 'cpp' },
  '.hpp': { grammar: 'cpp', tag: 'cpp' },
  '.swift': { grammar: 'swift', tag: 'swift' },
  '.kt': { grammar: 'kotlin', tag: 'kotlin' },
  '.scala': { grammar: 'scala', tag: 'scala' },
  '.lua': { grammar: 'lua', tag: 'lua' },
};

/** Lang tags for files we can't parse (used for display only). */
const TAG_ONLY: Record<string, string> = {
  '.css': 'css',
  '.scss': 'css',
  '.html': 'html',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.md': 'md',
  '.sh': 'bash',
  '.sql': 'sql',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

export function grammarFor(path: string): string | undefined {
  return EXTENSION_MAP[extname(path).toLowerCase()]?.grammar;
}

/** Viewer syntax-highlighting tag for a path; falls back to the bare extension. */
export function langTagFor(path: string): string {
  const ext = extname(path).toLowerCase();
  return EXTENSION_MAP[ext]?.tag ?? TAG_ONLY[ext] ?? ext.replace(/^\./, '');
}

/** Absolute path to the wasm grammar file, resolved from tree-sitter-wasms. */
export function wasmPathFor(grammar: string): string {
  const pkgDir = dirname(require.resolve('tree-sitter-wasms/package.json'));
  return join(pkgDir, 'out', `tree-sitter-${grammar}.wasm`);
}
