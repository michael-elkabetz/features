import { skimOrRaw } from '../skim/index.js';
import { candidateFiles, type RepoMap } from '../codemap/index.js';

const INVENTORY_MAP_CAP = 50000;
const MAX_CANDIDATES = 6;
const MAX_SURFACE_FILES = 2;
const PER_FILE_SKIM_CAP = 3000;

interface FeatureSeed {
  readonly id: string;
  readonly area: string;
  readonly name: string;
  readonly summary: string;
}

export type FileReader = (path: string) => Promise<string | undefined>;

export function buildInventoryContext(map: RepoMap): string {
  const lines: string[] = ['## Repository map (pre-computed — use instead of scanning)', ''];
  for (const f of map.files) {
    const syms = f.symbols.slice(0, 12).join(', ');
    lines.push(`- ${f.path}${syms ? ` — ${syms}` : ''}`);
    if (lines.join('\n').length > INVENTORY_MAP_CAP) {
      lines.push(`- … (${map.files.length} files total; map truncated)`);
      break;
    }
  }
  return lines.join('\n');
}

function surfaceFiles(map: RepoMap): string[] {
  // ponytail: obvious roots only; add framework-specific route discovery when misses show up.
  return map.files
    .map((f) => f.path)
    .filter((p) => /^(src\/)?(index|main|cli|server|routes?|router)\.[cm]?[jt]sx?$/.test(p))
    .slice(0, MAX_SURFACE_FILES);
}

export async function buildFeatureContext(feature: FeatureSeed, map: RepoMap, read: FileReader): Promise<string> {
  const candidates = [...new Set([...surfaceFiles(map), ...candidateFiles(feature, map, MAX_CANDIDATES)])].slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return '';

  const blocks: string[] = [];
  for (const path of candidates) {
    const source = await read(path);
    if (source === undefined) continue;
    const skimmed = await skimOrRaw(source, path, 'structure', PER_FILE_SKIM_CAP);
    blocks.push(`### ${path}\n\`\`\`\n${skimmed}\n\`\`\``);
  }
  if (blocks.length === 0) return '';

  return [
    '## Pre-computed code context',
    'These are the files most likely to implement this feature, plus user-facing entry points',
    'when obvious (CLI/web/API). Use them to choose your code references. Only open a file with',
    'Read when you must confirm exact line numbers — the compiler will heal ranges.',
    '',
    ...blocks,
  ].join('\n');
}
