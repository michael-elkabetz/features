import { join } from 'node:path';
import type { FeatureName, ClaudeModel } from '../types/index.js';
import { toFeatureName, resolveModel } from '../types/index.js';
import { DEFAULT_MODEL } from '../lib/config.js';
import { isCancelled } from '../lib/errors.js';
import type { SkillService } from '../services/skill.service.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import {
  showIntro,
  showOutro,
  showBinahIntro,
  askFeatureName,
  showError,
} from '../ui/prompts.js';

interface SkillCommandOptions {
  model?: string;
}

interface SkillDeps {
  skillService: SkillService;
  fs: FilesystemRepository;
}

export function makeSkillCommand(deps: SkillDeps) {
  const { skillService, fs } = deps;

  return async function skillCommand(featureNameArg: string | undefined, options: SkillCommandOptions): Promise<void> {
    showIntro();

    let rawName = featureNameArg;
    if (!rawName) {
      const result = await askFeatureName('');
      if (isCancelled(result)) {
        showOutro('Cancelled.');
        return;
      }
      rawName = result;
    }

    const featureName: FeatureName = toFeatureName(rawName);

    const kbPath = join('.features', featureName, 'kb', 'knowledge.md');
    const legacyKbPath = join('.features', featureName, 'knowledge', 'knowledge.md');
    let resolvedKbPath: string;

    if (await fs.exists(kbPath)) {
      resolvedKbPath = kbPath;
    } else if (await fs.exists(legacyKbPath)) {
      resolvedKbPath = legacyKbPath;
    } else {
      showError(`KB not found at ${kbPath}. Run 'features create' first.`);
      return;
    }

    const topic = (featureName as string).replace(/^features-/, '').replace(/-/g, ' ');
    const model: ClaudeModel = resolveModel(options.model, DEFAULT_MODEL);

    showBinahIntro();

    const exitCodeResult = await skillService.createSkill({
      featureName,
      topic,
      kbPath: resolvedKbPath,
      model,
    });

    console.log();
    if (!exitCodeResult.ok) {
      showError(exitCodeResult.error.message);
      showOutro();
      return;
    }

    if (exitCodeResult.value === 0) {
      showOutro(`Skill created at .features/${featureName}/skill/`);
    } else {
      showOutro(`Claude exited with code ${exitCodeResult.value}.`);
    }
  };
}
