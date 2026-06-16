import { describe, it, expect } from 'vitest';
import { buildInventoryContext, buildFeatureContext } from './context-builder.js';
import type { RepoMap } from '../codemap/index.js';

const MAP: RepoMap = {
  files: [
    { path: 'src/billing.ts', symbols: ['BillingService', 'charge'], imports: [] },
    { path: 'src/auth.ts', symbols: ['login'], imports: ['src/billing.ts'] },
  ],
  symbolIndex: new Map([['BillingService', ['src/billing.ts']], ['charge', ['src/billing.ts']], ['login', ['src/auth.ts']]]),
};

describe('buildInventoryContext', () => {
  it('lists files and their top-level symbols compactly', () => {
    const ctx = buildInventoryContext(MAP);
    expect(ctx).toContain('src/billing.ts');
    expect(ctx).toContain('BillingService');
    expect(ctx).toContain('## Repository map');
  });

  it('caps very large maps', () => {
    const big: RepoMap = { files: Array.from({ length: 5000 }, (_, i) => ({ path: `f${i}.ts`, symbols: [`S${i}`], imports: [] })), symbolIndex: new Map() };
    const ctx = buildInventoryContext(big);
    expect(ctx.length).toBeLessThan(60000);
  });
});

describe('buildFeatureContext', () => {
  it('embeds skimmed structure of candidate files', async () => {
    const reader = async (p: string) => (p === 'src/billing.ts' ? 'export class BillingService {\n  charge() { return 1; }\n}' : undefined);
    const ctx = await buildFeatureContext(
      { id: 'billing', area: 'pay', name: 'Billing', summary: 'charge a card via BillingService' },
      MAP,
      reader,
    );
    expect(ctx).toContain('src/billing.ts');
    expect(ctx).toContain('BillingService');
    expect(ctx).toContain('Pre-computed');
  });

  it('includes obvious CLI/web entry points even when the feature terms do not match them', async () => {
    const map: RepoMap = {
      files: [...MAP.files, { path: 'src/index.ts', symbols: ['program'], imports: [] }],
      symbolIndex: MAP.symbolIndex,
    };
    const ctx = await buildFeatureContext(
      { id: 'billing', area: 'pay', name: 'Billing', summary: 'charge a card via BillingService' },
      map,
      async (p) => (p === 'src/index.ts' ? 'program.command("billing").action(billingCommand)' : p === 'src/billing.ts' ? 'export class BillingService {}' : undefined),
    );
    expect(ctx).toContain('src/index.ts');
    expect(ctx).toContain('src/billing.ts');
  });

  it('returns empty string when nothing matches (caller skips injection)', async () => {
    const ctx = await buildFeatureContext({ id: 'z', area: 'z', name: 'zzz', summary: '' }, MAP, async () => undefined);
    expect(ctx).toBe('');
  });
});
