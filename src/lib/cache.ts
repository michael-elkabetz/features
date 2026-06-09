import { createHash } from 'node:crypto';
import { rename, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { InventoryEntry } from '../services/analyze.service.js';

const CACHE_VERSION = 1;
const CACHE_FILE = '.code-explain/.cache.json';

interface CacheEntry {
  readonly inventoryHash: string;
  readonly analyzedAt: string;
  readonly lastAnalyzedMs: number;
}

interface CacheData {
  readonly version: number;
  readonly promptHash: string;
  readonly features: Record<string, CacheEntry>;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function hashInventoryEntry(entry: InventoryEntry): string {
  return sha256(`${entry.id}|${entry.area}|${entry.name}|${entry.summary}`);
}

export class AnalysisCache {
  private data: CacheData;
  private dirty = false;

  private constructor(
    private readonly rootDir: string,
    private readonly promptHash: string,
    data: CacheData | null,
  ) {
    if (data && data.version === CACHE_VERSION && data.promptHash === promptHash) {
      this.data = data;
    } else {
      this.data = { version: CACHE_VERSION, promptHash, features: {} };
    }
  }

  static async load(rootDir: string, promptContent: string): Promise<AnalysisCache> {
    const promptHash = sha256(promptContent);
    const filePath = resolve(rootDir, CACHE_FILE);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as CacheData;
      return new AnalysisCache(rootDir, promptHash, parsed);
    } catch {
      return new AnalysisCache(rootDir, promptHash, null);
    }
  }

  isValid(entry: InventoryEntry, changedFiles: ReadonlySet<string>, featureRefPaths: readonly string[]): boolean {
    const cached = this.data.features[entry.id];
    if (!cached) return false;
    if (cached.inventoryHash !== hashInventoryEntry(entry)) return false;
    for (const refPath of featureRefPaths) {
      if (changedFiles.has(refPath)) return false;
    }
    return true;
  }

  update(entry: InventoryEntry, analyzedAt: string): void {
    this.data = {
      ...this.data,
      features: {
        ...this.data.features,
        [entry.id]: {
          inventoryHash: hashInventoryEntry(entry),
          analyzedAt,
          lastAnalyzedMs: Date.now(),
        },
      },
    };
    this.dirty = true;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    const filePath = resolve(this.rootDir, CACHE_FILE);
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8');
    await rename(tmpPath, filePath);
    this.dirty = false;
  }
}
