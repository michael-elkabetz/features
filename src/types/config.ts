export const CLAUDE_MODELS = ['sonnet', 'opus', 'haiku'] as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

export type UpdateTarget = 'kb' | 'skill';

export type ReviewChoice = 'approve' | 'edit' | 'skip';

export function isClaudeModel(value: string): value is ClaudeModel {
  return (CLAUDE_MODELS as readonly string[]).includes(value);
}

export function resolveModel(raw: string | undefined, fallback: ClaudeModel): ClaudeModel {
  if (!raw) return fallback;
  if (isClaudeModel(raw)) return raw;
  return raw as ClaudeModel;
}
