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

export interface TokenUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
}

export interface ResultStreamEvent {
  readonly type: 'result';
  readonly is_error: boolean;
  readonly subtype?: string;
  readonly result?: string;
  readonly duration_ms?: number;
  readonly num_turns?: number;
  readonly total_cost_usd?: number;
  readonly usage?: TokenUsage;
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
  readonly onEvent?: (event: ClaudeStreamEvent) => void;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
  readonly maxTurns?: number;
  readonly settingsJson?: string;  // JSON string for --settings flag
}

export interface ClaudeResult {
  readonly exitCode: number;
  readonly costUsd?: number;
  readonly durationMs?: number;
  readonly numTurns?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
}

export function isClaudeStreamEvent(value: unknown): value is ClaudeStreamEvent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.type === 'assistant' || obj.type === 'result';
}
