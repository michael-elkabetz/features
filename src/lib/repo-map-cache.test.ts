import { describe, it, expect } from 'vitest';
import { mtimeFingerprint } from './repo-map-cache.js';

describe('mtimeFingerprint', () => {
  it('returns the same fingerprint for the same files', () => {
    const files = new Map([
      ['src/a.ts', 1000],
      ['src/b.ts', 2000],
    ]);
    expect(mtimeFingerprint(files)).toBe(mtimeFingerprint(files));
  });

  it('is order-independent', () => {
    const a = new Map([['src/a.ts', 1000], ['src/b.ts', 2000]]);
    const b = new Map([['src/b.ts', 2000], ['src/a.ts', 1000]]);
    expect(mtimeFingerprint(a)).toBe(mtimeFingerprint(b));
  });

  it('changes when mtime changes', () => {
    const before = new Map([['src/a.ts', 1000]]);
    const after = new Map([['src/a.ts', 9999]]);
    expect(mtimeFingerprint(before)).not.toBe(mtimeFingerprint(after));
  });
});
