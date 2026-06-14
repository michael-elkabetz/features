import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grammarFor } from '../verify/languages.js';
import { buildRepoMapFromFiles, type RepoMap } from './repo-map.js';
import { DEFAULT_IGNORE_DIRS } from '../lib/analysis-config.js';

const MAX_FILE_BYTES = 256 * 1024;

function isIgnored(path: string): boolean {
  return DEFAULT_IGNORE_DIRS.some((d) => path === d || path.startsWith(`${d}/`) || path.includes(`/${d}/`));
}

export async function buildRepoMap(root: string, trackedFiles: readonly string[]): Promise<RepoMap> {
  const sources = new Map<string, string>();
  for (const rel of trackedFiles) {
    if (isIgnored(rel)) continue;
    if (!grammarFor(rel)) continue;
    try {
      const buf = await readFile(join(root, rel));
      if (buf.byteLength > MAX_FILE_BYTES) continue;
      sources.set(rel.replace(/\\/g, '/'), buf.toString('utf-8'));
    } catch {
      // unreadable — skip
    }
  }
  return buildRepoMapFromFiles(sources);
}
