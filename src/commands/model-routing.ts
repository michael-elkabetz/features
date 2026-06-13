import type { ClaudeModel } from '../types/index.js';

export function modelForComplexity(
  complexity: 'simple' | 'moderate' | 'complex' | undefined,
  baseModel: ClaudeModel,
  lightModel: ClaudeModel | undefined,
): ClaudeModel {
  if (!lightModel) return baseModel;
  if (complexity === 'simple' || complexity === 'moderate') return lightModel;
  return baseModel;
}
