export const CLAUDE_MODELS = ['sonnet', 'opus', 'haiku', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'] as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

export type ReviewChoice = 'approve' | 'edit' | 'skip';

export function isClaudeModel(value: string): value is ClaudeModel {
  return (CLAUDE_MODELS as readonly string[]).includes(value);
}

export function resolveModel(raw: string | undefined, fallback: ClaudeModel): ClaudeModel {
  if (!raw) return fallback;
  if (isClaudeModel(raw)) return raw;
  return raw as ClaudeModel;
}
