import { join } from 'node:path';
import type { Result, FeatureName, ClaudeModel } from '../types/index.js';
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

    const kbFilePath = join('.features', featureName, 'kb', 'KNOWLEDGE.md');
    const userMessage = `Create a knowledge file for: ${topic}\n\nWrite the output to: ${kbFilePath}`;

    const claudeResult = await this.claudeClient.execute({
      systemPromptFile: KB_PROMPT_PATH,
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

}
