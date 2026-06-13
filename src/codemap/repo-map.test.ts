import { describe, it, expect } from 'vitest';
import { buildRepoMapFromFiles } from './repo-map.js';

describe('buildRepoMapFromFiles', () => {
  it('indexes symbols and import edges from in-memory files', async () => {
    const files = new Map<string, string>([
      ['src/billing.ts', `export class BillingService {\n  charge() { return 1; }\n}`],
      ['src/user.ts', `import { BillingService } from './billing';\nexport function makeUser() { return new BillingService(); }`],
    ]);
    const map = await buildRepoMapFromFiles(files);

    expect(map.files.find((f) => f.path === 'src/billing.ts')!.symbols).toContain('BillingService');
    expect(map.symbolIndex.get('BillingService')).toContain('src/billing.ts');
    // user.ts imports billing.ts (resolved relative specifier)
    expect(map.files.find((f) => f.path === 'src/user.ts')!.imports).toContain('src/billing.ts');
  });

  it('skips files with unparseable grammar without throwing', async () => {
    const files = new Map([['a.unknownext', 'random content']]);
    const map = await buildRepoMapFromFiles(files);
    expect(map.files).toHaveLength(1);
    expect(map.files[0]!.symbols).toEqual([]);
  });
});
