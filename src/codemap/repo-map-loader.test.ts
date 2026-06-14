import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRepoMap } from './repo-map-loader.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codemap-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src/a.ts'), 'export function hello() { return 1; }');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('buildRepoMap', () => {
  it('reads listed source files relative to root', async () => {
    const map = await buildRepoMap(dir, ['src/a.ts', 'README.md', 'node_modules/x/y.ts']);
    expect(map.symbolIndex.get('hello')).toContain('src/a.ts');
  });
});
