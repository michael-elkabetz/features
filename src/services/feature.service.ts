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

  async implementTask(task: string, model: ClaudeModel): Promise<Result<void>> {
    const result = await this.claudeClient.execute({
      appendSystemPrompt: buildDefaultImplementPrompt(),
      userPrompt: task,
      model,
    });

    if (!result.ok) return result;
    return ok(undefined);
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

function buildDefaultImplementPrompt(): string {
  return [
    '# features implement — default mode',
    '',
    'CRITICAL RULES:',
    '- First inspect the project feature docs under .features/ and choose the smallest relevant feature, if one exists.',
    '- If a relevant feature exists, follow its documented knowledge/skill and update those docs after code changes.',
    '- If no relevant feature exists, implement directly in code with the smallest working change.',
    '- Do not do broad code exploration until feature docs are absent or insufficient.',
  ].join('\n');
}
