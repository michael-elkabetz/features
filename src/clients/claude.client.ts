import { spawn } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import ora, { type Ora } from 'ora';
import type { ClaudeOptions, ClaudeResult, ClaudeStreamEvent, Result, ResultStreamEvent, ToolUseBlock } from '../types/index.js';
import { fail, isClaudeStreamEvent, ok } from '../types/index.js';

/** Patterns the `claude` CLI surfaces in a `result` event when a usage/rate/overage limit is hit. */
const RATE_LIMIT_RE = /usage.?limit|rate.?limit|quota|too many requests|\b429\b|overloaded|over_?capacity|exceeded your/i;

/** True when a result event indicates the run was blocked by a usage/rate limit (vs. a normal failure). */
export function isRateLimitResult(result: ResultStreamEvent | null): boolean {
  if (!result) return false;
  return RATE_LIMIT_RE.test(result.result ?? '') || RATE_LIMIT_RE.test(result.subtype ?? '');
}

export class ClaudeClient {
  async execute(options: ClaudeOptions): Promise<Result<ClaudeResult>> {
    const { systemPrompt, systemPromptFile, appendSystemPrompt, appendSystemPromptFile, userPrompt, model, print, onEvent, cwd, signal, maxTurns, settingsJson } = options;

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

    if (maxTurns !== undefined) {
      args.push('--max-turns', String(maxTurns));
    }

    if (settingsJson) {
      args.push('--settings', settingsJson);
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

      const ignoreParentSigint = (): void => {};
      if (!print) process.on('SIGINT', ignoreParentSigint);

      let aborted = false;
      if (signal) {
        const onAbort = () => {
          aborted = true;
          child.kill('SIGTERM');
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
          child.on('close', () => signal.removeEventListener('abort', onAbort));
        }
      }

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
        if (!print) process.off('SIGINT', ignoreParentSigint);
        stopSpinner(activeSpinner);
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve(
            fail('CLAUDE_NOT_FOUND', 'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code'),
          );
        } else {
          resolve(fail('CLAUDE_FAILED', `Claude process error: ${err.message}`, err));
        }
      });

      child.on('close', (code, closeSignal) => {
        cleanup();
        if (!print) process.off('SIGINT', ignoreParentSigint);
        stopSpinner(activeSpinner);
        if (aborted) {
          resolve(fail('CLAUDE_ABORTED', 'Claude process was interrupted'));
          return;
        }
        // A usage/rate/overage limit takes priority over the generic failure codes so callers
        // can pause-and-retry rather than treating it as a hard error.
        if (isRateLimitResult(resultEvent)) {
          resolve(fail('CLAUDE_RATE_LIMITED', resultEvent?.result?.trim() || 'Claude usage limit reached'));
          return;
        }
        if (!print && (code === 130 || closeSignal === 'SIGINT')) {
          resolve(ok({ exitCode: code ?? 130 }));
          return;
        }
        if (code !== 0) {
          resolve(fail('CLAUDE_FAILED', `Claude exited with code ${code ?? 'unknown'}`));
          return;
        }
        if (resultIsError) {
          resolve(fail('CLAUDE_FAILED', resultEvent?.result?.trim() || 'Claude reported an error result'));
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
