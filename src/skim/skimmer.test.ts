import { describe, it, expect } from 'vitest';
import { skimFile, skimOrRaw } from './skimmer.js';

const TS = `import { z } from 'zod';

export interface User {
  id: string;
  name: string;
}

export class BillingService {
  private rate = 0.1;
  async charge(userId: string, amount: number): Promise<boolean> {
    const fee = amount * this.rate;
    console.log(fee);
    return true;
  }
}

export function add(a: number, b: number): number {
  return a + b;
}
`;

describe('skimFile', () => {
  it('returns undefined for unparseable extensions', async () => {
    expect(await skimFile('x', 'a.unknownext', 'structure')).toBeUndefined();
  });

  it('structure mode keeps signatures and elides bodies', async () => {
    const out = await skimFile(TS, 'a.ts', 'structure');
    expect(out).toBeDefined();
    expect(out!).toContain('class BillingService');
    expect(out!).toContain('charge(userId: string, amount: number)');
    // body statements are gone
    expect(out!).not.toContain('amount * this.rate');
    expect(out!).not.toContain('console.log');
    // elision marker present
    expect(out!).toContain('…');
    // function signature kept
    expect(out!).toContain('function add(a: number, b: number): number');
  });

  it('structure output is materially smaller than source', async () => {
    const out = await skimFile(TS, 'a.ts', 'structure');
    expect(out!.length).toBeLessThan(TS.length);
  });

  it('signatures mode produces one compact line per declaration', async () => {
    const out = await skimFile(TS, 'a.ts', 'signatures');
    expect(out!).toContain('BillingService');
    expect(out!).toContain('charge');
    expect(out!).not.toContain('{');
  });
});

describe('skimOrRaw', () => {
  it('falls back to truncated raw text for unparseable files', async () => {
    const css = 'body { color: red; }\n'.repeat(100);
    const out = await skimOrRaw(css, 'a.css', 'structure', 200);
    expect(out.length).toBeLessThanOrEqual(220);
  });
});
