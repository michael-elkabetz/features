import type { Result, Feature, ClaudeModel } from '../types/index.js';
import { ok, fail } from '../types/index.js';
import type { FeatureRepository } from '../repositories/feature.repository.js';
import type { ClaudeClient } from '../clients/claude.client.js';

export class FeatureService {
  constructor(
    private readonly featureRepo: FeatureRepository,
    private readonly claudeClient: ClaudeClient,
  ) {}

  async listFeatures(): Promise<Result<Feature[]>> {
    return this.featureRepo.findAll();
  }

  async executeFeature(feature: Feature, task: string, model: ClaudeModel): Promise<Result<void>> {
    const kbResult = await this.featureRepo.readKB(feature);
    if (!kbResult.ok) return kbResult;

    const appendPrompt = [
      '# Feature KB — MANDATORY CONTEXT',
      '',
      'CRITICAL RULES:',
      '- You ALREADY have all the knowledge you need below. Do NOT explore, scan, or investigate the codebase to understand it.',
      '- Do NOT use Glob, Grep, or subagents to discover patterns or architecture — that work has already been done for you.',
      '- ONLY read specific files when you need to edit them.',
      '- Follow the patterns and conventions described in the knowledge below exactly.',
      '',
      '---',
      '',
      kbResult.value,
    ].join('\n');

    const userPrompt = feature.hasSkill
      ? `/${feature.name} ${task}`
      : task;

    const result = await this.claudeClient.execute({
      appendSystemPrompt: appendPrompt,
      userPrompt,
      model,
    });

    if (!result.ok) return result;
    return ok(undefined);
  }
}
