import type { RepoMap } from './repo-map.js';

interface FeatureSeed {
  readonly id: string;
  readonly area: string;
  readonly name: string;
  readonly summary: string;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'with', 'in', 'on', 'is', 'are', 'be', 'this', 'that']);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function symbolWords(sym: string): string[] {
  return sym
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

export function candidateFiles(feature: FeatureSeed, map: RepoMap, limit: number): string[] {
  const terms = new Set([...tokenize(feature.name), ...tokenize(feature.summary), ...tokenize(feature.id), ...tokenize(feature.area)]);
  if (terms.size === 0) return [];

  const scored = map.files.map((f) => {
    let score = 0;
    const pathWords = new Set(symbolWords(f.path));
    for (const t of terms) if (pathWords.has(t)) score += 3;
    for (const sym of f.symbols) {
      const words = new Set(symbolWords(sym));
      for (const t of terms) if (words.has(t)) score += 2;
    }
    return { path: f.path, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((s) => s.path);
}
