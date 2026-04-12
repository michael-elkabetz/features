export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: 'tool_use';
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock;

export interface AssistantStreamEvent {
  readonly type: 'assistant';
  readonly message: { readonly content: ContentBlock[] };
}

export interface ResultStreamEvent {
  readonly type: 'result';
  readonly is_error: boolean;
  readonly result?: string;
  readonly duration_ms?: number;
  readonly num_turns?: number;
}

export type ClaudeStreamEvent = AssistantStreamEvent | ResultStreamEvent;

export interface ClaudeOptions {
  readonly systemPrompt?: string;
  readonly systemPromptFile?: string;
  readonly appendSystemPrompt?: string;
  readonly appendSystemPromptFile?: string;
  readonly userPrompt: string;
  readonly model?: string;
  readonly print?: boolean;
}

export interface ClaudeResult {
  readonly exitCode: number;
}

export function isClaudeStreamEvent(value: unknown): value is ClaudeStreamEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.type === 'assistant' || obj.type === 'result';
}
