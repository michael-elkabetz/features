import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Result, Feature, FeatureName, ClaudeModel } from '../types/index.js';
import { ok, fail } from '../types/index.js';
import {
  SKILL_CREATION_PROMPT_PATH,
  SKILL_CREATOR_REPO,
  SKILL_CREATOR_SUBPATH,
  SKILL_CREATOR_INSTALL_DIR,
} from '../lib/config.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import type { ClaudeClient } from '../clients/claude.client.js';
import type { GitClient } from '../clients/git.client.js';

export interface CreateSkillOptions {
  readonly featureName: FeatureName;
  readonly topic: string;
  readonly kbPath: string;
  readonly model: ClaudeModel;
}

export class SkillService {
  constructor(
    private readonly fs: FilesystemRepository,
    private readonly claudeClient: ClaudeClient,
    private readonly gitClient: GitClient,
  ) {}

  async ensureSkillCreator(): Promise<Result<void>> {
    const installPath = join(SKILL_CREATOR_INSTALL_DIR, 'SKILL.md');
    if (this.fs.existsSync(installPath)) {
      return ok(undefined);
    }

    const installDir = this.fs.resolve(SKILL_CREATOR_INSTALL_DIR);
    const tmpDir = join(tmpdir(), `features-skill-creator-${Date.now()}`);

    try {
      const sparseResult = await this.gitClient.sparseClone(SKILL_CREATOR_REPO, SKILL_CREATOR_SUBPATH, tmpDir);

      if (!sparseResult.ok) {
        await this.fs.removeAbsolute(tmpDir);
        const shallowResult = await this.gitClient.shallowClone(SKILL_CREATOR_REPO, tmpDir);
        if (!shallowResult.ok) return shallowResult;
      }

      const srcDir = join(tmpDir, SKILL_CREATOR_SUBPATH);
      const ensureResult = await this.fs.ensureDir(SKILL_CREATOR_INSTALL_DIR);
      if (!ensureResult.ok) return ensureResult;

      const copyResult = await this.fs.copyAbsolute(srcDir, installDir);
      if (!copyResult.ok) return copyResult;

      return ok(undefined);
    } finally {
      await this.fs.removeAbsolute(tmpDir);
    }
  }

  async createSkill(options: CreateSkillOptions): Promise<Result<number>> {
    const { featureName, topic, kbPath, model } = options;

    const installResult = await this.ensureSkillCreator();
    if (!installResult.ok) return installResult;

    const skillDir = join('.features', featureName, 'skill');
    const ensureResult = await this.fs.ensureDir(skillDir);
    if (!ensureResult.ok) return ensureResult;

    const userMessage = [
      `/skill-creator Create a skill for "${topic}" based on the knowledge file at ${kbPath}.`,
      '',
      `Place ALL output (SKILL.md, scripts/, agents/, references/, everything) inside ${skillDir}/`,
      '',
      `The knowledge file path for the Knowledge Sync feedback loop is: ${kbPath}`,
      '',
      'Do not ask me questions — read the knowledge file and create the skill.',
    ].join('\n');

    const result = await this.claudeClient.execute({
      appendSystemPromptFile: SKILL_CREATION_PROMPT_PATH,
      userPrompt: userMessage,
      model,
      print: true,
    });

    if (!result.ok) return result;
    return ok(result.value.exitCode);
  }

  async updateSkill(feature: Feature, model: ClaudeModel): Promise<Result<void>> {
    const userPrompt = buildSkillUpdatePrompt(feature.skillPath, feature.kbPath);

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

function buildSkillUpdatePrompt(skillPath: string, kbPath: string): string {
  return [
    `Investigate the current state of the codebase and update the skill at ${skillPath}.`,
    '',
    'Instructions:',
    `1. Read the existing skill file at ${skillPath}.`,
    `2. Read the KB at ${kbPath} — it contains the latest codebase patterns.`,
    '3. Scan the codebase to verify the skill instructions still match reality.',
    '4. Update the skill file in place:',
    '   - Fix step-by-step instructions that reference moved/renamed files or changed patterns',
    '   - Add steps for new patterns described in the KB',
    '   - Remove steps for patterns that no longer exist',
    '   - Keep the "MANDATORY — Read Before Doing Anything" preamble intact',
    '   - Keep the "Knowledge Sync" final step intact',
    '   - Update any inline KB summaries to match the current KB',
    '5. Do NOT rewrite from scratch — revise existing sections.',
  ].join('\n');
}
