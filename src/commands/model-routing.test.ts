import { describe, it, expect } from 'vitest';
import { modelForComplexity } from './model-routing.js';

describe('modelForComplexity', () => {
  it('returns light model for simple features', () => {
    expect(modelForComplexity('simple', 'claude-opus-4-6', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('returns light model for moderate features', () => {
    expect(modelForComplexity('moderate', 'claude-opus-4-6', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('returns base model for complex features', () => {
    expect(modelForComplexity('complex', 'claude-opus-4-6', 'claude-sonnet-4-6')).toBe('claude-opus-4-6');
  });

  it('returns base model when complexity is undefined', () => {
    expect(modelForComplexity(undefined, 'claude-opus-4-6', 'claude-sonnet-4-6')).toBe('claude-opus-4-6');
  });

  it('uses base model as light model when lightModel is undefined', () => {
    expect(modelForComplexity('simple', 'claude-opus-4-6', undefined)).toBe('claude-opus-4-6');
  });
});
