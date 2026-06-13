import { describe, it, expect } from 'vitest';
import { turnCapFor } from './analyze.service.js';

describe('turnCapFor', () => {
  it('returns 10 for simple', () => expect(turnCapFor('simple')).toBe(10));
  it('returns 10 for moderate', () => expect(turnCapFor('moderate')).toBe(10));
  it('returns 18 for complex', () => expect(turnCapFor('complex')).toBe(18));
  it('returns 18 for undefined (conservative)', () => expect(turnCapFor(undefined)).toBe(18));
});
