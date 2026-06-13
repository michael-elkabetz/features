import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { RepoMap } from '../codemap/index.js';

const CACHE_FILE = '.features/_repo-map-cache.json';

interface CacheEntry {
  fingerprint: string;
  map: SerializedRepoMap;
}

interface SerializedRepoMap {
  files: Array<{ path: string; symbols: string[]; imports: string[] }>;
}

export function mtimeFingerprint(files: Map<string, number>): string {
  const sorted = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
  const payload = sorted.map(([p, t]) => `${p}:${t}`).join('\n');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export async function fingerprintFiles(root: string, paths: string[]): Promise<Map<string, number>> {
  const mtimes = new Map<string, number>();
  await Promise.all(
    paths.map(async (p) => {
      try {
        const s = await stat(`${root}/${p}`);
        mtimes.set(p, s.mtimeMs);
      } catch {
        // file gone
      }
    }),
  );
  return mtimes;
}

function serializeMap(map: RepoMap): SerializedRepoMap {
  return {
    files: map.files.map((f) => ({ path: f.path, symbols: f.symbols, imports: f.imports })),
  };
}

function deserializeMap(s: SerializedRepoMap): RepoMap {
  const files = s.files.map((f) => ({ path: f.path, symbols: f.symbols, imports: f.imports }));
  const symbolIndex = new Map<string, string[]>();
  for (const f of files) {
    for (const sym of f.symbols) {
      const existing = symbolIndex.get(sym);
      if (existing) existing.push(f.path);
      else symbolIndex.set(sym, [f.path]);
    }
  }
  return { files, symbolIndex };
}

export async function loadCachedRepoMap(root: string, fingerprint: string): Promise<RepoMap | null> {
  try {
    const raw = await readFile(`${root}/${CACHE_FILE}`, 'utf-8');
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.fingerprint !== fingerprint) return null;
    return deserializeMap(entry.map);
  } catch {
    return null;
  }
}

export async function saveCachedRepoMap(root: string, fingerprint: string, map: RepoMap): Promise<void> {
  try {
    const entry: CacheEntry = { fingerprint, map: serializeMap(map) };
    await writeFile(`${root}/${CACHE_FILE}`, JSON.stringify(entry), 'utf-8');
  } catch {
    // best-effort
  }
}
