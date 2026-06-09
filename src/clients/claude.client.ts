import { spawn } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import ora, { type Ora } from 'ora';
import type { ClaudeOptions, ClaudeResult, ClaudeStreamEvent, Result, ResultStreamEvent, ToolUseBlock } from '../types/index.js';
import { fail, isClaudeStreamEvent, ok } from '../types/index.js';

export class ClaudeClient {
  async execute(options: ClaudeOptions): Promise<Result<ClaudeResult>> {
    const { systemPrompt, systemPromptFile, appendSystemPrompt, appendSystemPromptFile, userPrompt, model, print, onEvent, cwd } = options;

    const tmpFiles: string[] = [];
    const args: string[] = [];

    if (print) {
      args.push('-p', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'acceptEdits');
    }

    if (systemPromptFile) {
      args.push('--system-prompt-file', systemPromptFile);
    } else if (systemPrompt) {
      const tmpFile = join(tmpdir(), `features-sys-${process.pid}-${Math.random().toString(36).slice(2)}.md`);
      await writeFile(tmpFile, systemPrompt, 'utf-8');
      tmpFiles.push(tmpFile);
      args.push('--system-prompt-file', tmpFile);
    }

    if (appendSystemPromptFile) {
      args.push('--append-system-prompt-file', appendSystemPromptFile);
    } else if (appendSystemPrompt) {
      const tmpFile = join(tmpdir(), `features-append-${process.pid}-${Math.random().toString(36).slice(2)}.md`);
      await writeFile(tmpFile, appendSystemPrompt, 'utf-8');
      tmpFiles.push(tmpFile);
      args.push('--append-system-prompt-file', tmpFile);
    }

    if (model) {
      args.push('--model', model);
    }

    args.push(userPrompt);

    const cleanup = (): void => {
      for (const f of tmpFiles) {
        unlink(f).catch(() => {});
      }
    };

    return new Promise((resolve) => {
      const child = spawn('claude', args, {
        cwd,
        stdio: print ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      });

      let activeSpinner: Ora | null = null;
      let resultIsError = false;
      let resultEvent: ResultStreamEvent | null = null;

      if (print && child.stdout) {
        const rl = createInterface({ input: child.stdout });
        rl.on('line', (line) => {
          try {
            const parsed: unknown = JSON.parse(line);
            if (!isClaudeStreamEvent(parsed)) return;
            if (parsed.type === 'result') {
              if (parsed.is_error) resultIsError = true;
              resultEvent = parsed;
            }
            if (onEvent) {
              onEvent(parsed);
            } else {
              activeSpinner = renderStreamEvent(parsed, activeSpinner);
            }
          } catch {
            // non-JSON line
          }
        });
      }

      child.on('error', (err) => {
        cleanup();
        stopSpinner(activeSpinner);
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve(
            fail('CLAUDE_NOT_FOUND', 'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code'),
          );
        } else {
          resolve(fail('CLAUDE_FAILED', `Claude process error: ${err.message}`, err));
        }
      });

      child.on('close', (code) => {
        cleanup();
        stopSpinner(activeSpinner);
        if (code !== 0) {
          resolve(fail('CLAUDE_FAILED', `Claude exited with code ${code ?? 'unknown'}`));
          return;
        }
        if (resultIsError) {
          resolve(fail('CLAUDE_FAILED', 'Claude reported an error result'));
          return;
        }
        resolve(ok({
          exitCode: code ?? 0,
          costUsd: resultEvent?.total_cost_usd,
          durationMs: resultEvent?.duration_ms,
          numTurns: resultEvent?.num_turns,
          inputTokens: resultEvent?.usage?.input_tokens,
          outputTokens: resultEvent?.usage?.output_tokens,
          cacheReadTokens: resultEvent?.usage?.cache_read_input_tokens,
        }));
      });
    });
  }
}

function stopSpinner(spinner: Ora | null): void {
  if (spinner?.isSpinning) {
    spinner.stop();
  }
}

function toolLabel(block: ToolUseBlock): string | null {
  const name = block.name || '';
  const input = block.input || {};
  if (name === 'Write' && input.file_path) return `Writing ${input.file_path}`;
  if (name === 'Read' && input.file_path) return `Reading ${input.file_path}`;
  if (name === 'Glob') return `Searching ${input.pattern || ''}`;
  if (name === 'Grep') return `Grep: ${input.pattern || ''}`;
  if (name === 'Bash') return (input.command as string) || 'Running command';
  if (name === 'Agent') return (input.description as string) || name;
  if (name) return name;
  return null;
}

function renderStreamEvent(event: ClaudeStreamEvent, activeSpinner: Ora | null): Ora | null {
  if (event.type === 'assistant' && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) {
        stopSpinner(activeSpinner);
        activeSpinner = null;
        process.stdout.write(`  ${block.text}\n`);
      }
      if (block.type === 'tool_use') {
        const label = toolLabel(block);
        if (label) {
          if (activeSpinner?.isSpinning) {
            activeSpinner.text = label;
          } else {
            stopSpinner(activeSpinner);
            activeSpinner = ora({ text: label, indent: 2 }).start();
          }
        }
      }
    }
  }

  if (event.type === 'result') {
    stopSpinner(activeSpinner);
    activeSpinner = null;
    if (event.is_error) {
      process.stdout.write(`  Error: ${event.result || 'Unknown error'}\n`);
    } else {
      const duration = event.duration_ms ? `${Math.round(event.duration_ms / 1000)}s` : '';
      const turns = event.num_turns ? `${event.num_turns} turns` : '';
      const info = [turns, duration].filter(Boolean).join(', ');
      process.stdout.write(`  Done${info ? ` (${info})` : ''}\n`);
    }
  }

  return activeSpinner;
}
