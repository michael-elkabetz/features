import { describe, it, expect } from 'vitest';
import { candidateFiles } from './feature-match.js';
import type { RepoMap } from './repo-map.js';

const MAP: RepoMap = {
  files: [
    { path: 'src/billing/charge.ts', symbols: ['chargeCard', 'BillingService'], imports: [] },
    { path: 'src/auth/login.ts', symbols: ['loginUser'], imports: ['src/billing/charge.ts'] },
    { path: 'src/unrelated/zebra.ts', symbols: ['zebra'], imports: [] },
  ],
  symbolIndex: new Map([
    ['chargeCard', ['src/billing/charge.ts']],
    ['BillingService', ['src/billing/charge.ts']],
    ['loginUser', ['src/auth/login.ts']],
    ['zebra', ['src/unrelated/zebra.ts']],
  ]),
};

describe('candidateFiles', () => {
  it('ranks files matching the feature name/summary tokens first', () => {
    const result = candidateFiles({ id: 'billing', area: 'payments', name: 'Card Billing', summary: 'Charge a credit card' }, MAP, 5);
    expect(result[0]).toBe('src/billing/charge.ts');
    expect(result).not.toContain('src/unrelated/zebra.ts');
  });

  it('respects the limit', () => {
    const result = candidateFiles({ id: 'x', area: 'y', name: 'login', summary: '' }, MAP, 1);
    expect(result).toHaveLength(1);
  });
});
