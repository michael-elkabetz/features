import { describe, it, expect } from 'vitest';
import { turnCapFor, featureCountHint } from './analyze.service.js';

describe('turnCapFor', () => {
  it('returns 10 for simple', () => expect(turnCapFor('simple')).toBe(10));
  it('returns 10 for moderate', () => expect(turnCapFor('moderate')).toBe(10));
  it('returns 18 for complex', () => expect(turnCapFor('complex')).toBe(18));
  it('returns 18 for undefined (conservative)', () => expect(turnCapFor(undefined)).toBe(18));
});

describe('featureCountHint', () => {
  it('targets 3–6 for a tiny repo', () => expect(featureCountHint(30)).toContain('3–6'));
  it('targets 5–10 for a small repo', () => expect(featureCountHint(150)).toContain('5–10'));
  it('targets 8–16 for a mid repo', () => expect(featureCountHint(500)).toContain('8–16'));
  it('targets 12–22 for a larger repo', () => expect(featureCountHint(1500)).toContain('12–22'));
  it('caps at 15–30 for a big repo', () => expect(featureCountHint(5000)).toContain('15–30'));
  it('steers toward the lower end', () => expect(featureCountHint(30)).toMatch(/LOWER end/));
});
