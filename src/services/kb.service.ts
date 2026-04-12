import { join } from 'node:path';
import type { Result, Feature, FeatureName, ClaudeModel } from '../types/index.js';
import { ok, fail } from '../types/index.js';
import { KB_PROMPT_PATH } from '../lib/config.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import type { ClaudeClient } from '../clients/claude.client.js';

export class KBService {
  constructor(
    private readonly fs: FilesystemRepository,
    private readonly claudeClient: ClaudeClient,
  ) {}

  async createKB(
    featureName: FeatureName,
    topic: string,
    model: ClaudeModel,
  ): Promise<Result<string>> {
    const kbDir = join('.features', featureName, 'kb');
    const ensureResult = await this.fs.ensureDir(kbDir);
    if (!ensureResult.ok) return ensureResult;

    const localPromptPath = this.fs.resolve('.features', featureName, 'KB-CREATION.md');
    const copyResult = await this.fs.copyFileAbsolute(KB_PROMPT_PATH, localPromptPath);
    if (!copyResult.ok) return fail('FILESYSTEM_ERROR', 'Failed to copy KB prompt template');

    const kbFilePath = join('.features', featureName, 'kb', 'knowledge.md');
    const userMessage = `Create a knowledge file for: ${topic}\n\nWrite the output to: ${kbFilePath}`;

    const claudeResult = await this.claudeClient.execute({
      systemPromptFile: localPromptPath,
      userPrompt: userMessage,
      model,
      print: true,
    });

    if (!claudeResult.ok) return claudeResult;

    if (claudeResult.value.exitCode !== 0) {
      return fail('CLAUDE_FAILED', `Claude exited with code ${claudeResult.value.exitCode}`);
    }

    const kbExists = await this.fs.exists(kbFilePath);
    if (!kbExists) {
      return fail('KB_NOT_FOUND', 'KB was not created by Claude');
    }

    return ok(kbFilePath);
  }

  async updateKB(feature: Feature, model: ClaudeModel): Promise<Result<void>> {
    const userPrompt = buildKBUpdatePrompt(feature.kbPath);

    const result = await this.claudeClient.execute({
      userPrompt,
      model,
      print: true,
    });

    if (!result.ok) return result;

    if (result.value.exitCode !== 0) {
      return fail('CLAUDE_FAILED', `Claude exited with code ${result.value.exitCode}`);
    }

    return ok(undefined);
  }
}

function buildKBUpdatePrompt(kbPath: string): string {
  return [
    `Investigate the current state of the codebase and update the KB at ${kbPath}.`,
    '',
    'Instructions:',
    `1. Read the existing KB at ${kbPath} to understand what it currently covers.`,
    '2. Scan the codebase — use Glob, Grep, and Read to discover what has changed since the KB was written.',
    '3. Compare the current code against what the KB describes.',
    '4. Update the KB in place:',
    '   - Fix any sections that no longer reflect reality',
    '   - Add new patterns, conventions, or architecture that emerged since the last update',
    '   - Remove or correct stale information',
    '   - Keep the same YAML frontmatter format (description, category)',
    '   - Update the description keywords if the scope changed',
    '5. Keep the file under 500 lines.',
    '6. Do NOT rewrite from scratch — revise existing sections so the file reads as a coherent, up-to-date document.',
  ].join('\n');
}
