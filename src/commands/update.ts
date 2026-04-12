import { join } from 'node:path';
import chalk from 'chalk';
import type { ClaudeModel, UpdateTarget, Feature } from '../types/index.js';
import { resolveModel, toFeatureName } from '../types/index.js';
import { DEFAULT_MODEL } from '../lib/config.js';
import { isCancelled } from '../lib/errors.js';
import type { FeatureService } from '../services/feature.service.js';
import type { KBService } from '../services/kb.service.js';
import type { SkillService } from '../services/skill.service.js';
import type { DeployService } from '../services/deploy.service.js';
import {
  showUpdateIntro,
  showOutro,
  showError,
  showInfo,
  askSelectFeature,
  askUpdateTarget,
  askRedeploy,
} from '../ui/prompts.js';

interface UpdateDeps {
  featureService: FeatureService;
  kbService: KBService;
  skillService: SkillService;
  deployService: DeployService;
}

export function makeUpdateCommand(deps: UpdateDeps) {
  const { featureService, kbService, skillService, deployService } = deps;

  return async function updateCommand(featureNameArg: string | undefined, options: { model?: string }): Promise<void> {
    showUpdateIntro();

    const featuresResult = await featureService.listFeatures();
    if (!featuresResult.ok) {
      showError(featuresResult.error.message);
      showOutro();
      return;
    }

    const features = featuresResult.value;

    if (features.length === 0) {
      showError('No features found. Run `features create` first to build a feature from your codebase.');
      showOutro();
      return;
    }

    let selected: Feature | undefined;

    if (featureNameArg) {
      const normalized = toFeatureName(featureNameArg);
      selected = features.find((f) => f.name === normalized);
      if (!selected) {
        showError(`Feature "${normalized}" not found. Available: ${features.map((f) => f.name).join(', ')}`);
        showOutro();
        return;
      }
      showInfo(`Using ${selected.name}`);
    } else if (features.length === 1) {
      selected = features[0];
      showInfo(`Using ${selected.name}`);
    } else {
      const result = await askSelectFeature(features);
      if (isCancelled(result)) {
        showOutro('Cancelled.');
        return;
      }
      selected = features.find((f) => f.name === result);
      if (!selected) {
        showError(`Feature "${result}" not found.`);
        showOutro();
        return;
      }
    }

    const targetResult = await askUpdateTarget(selected);
    if (isCancelled(targetResult)) {
      showOutro('Cancelled.');
      return;
    }
    const target: UpdateTarget = targetResult;

    if (target === 'skill' && !selected.hasSkill) {
      const shortName = (selected.name as string).replace('features-', '');
      showError(`No skill found for ${selected.name}. Run \`features skill ${shortName}\` first.`);
      showOutro();
      return;
    }

    const model: ClaudeModel = resolveModel(options.model, DEFAULT_MODEL);
    const label = target === 'kb' ? 'KB' : 'skill';
    showInfo(`Updating ${label} for ${chalk.bold(selected.name)}...`);
    console.log();

    if (target === 'kb') {
      const result = await kbService.updateKB(selected, model);
      console.log();
      if (!result.ok) {
        showError(result.error.message);
        showOutro();
        return;
      }
    } else {
      const result = await skillService.updateSkill(selected, model);
      console.log();
      if (!result.ok) {
        showError(result.error.message);
        showOutro();
        return;
      }
    }

    if (target === 'skill') {
      const redeployResult = await askRedeploy();
      if (isCancelled(redeployResult)) {
        showOutro(`Skill updated at ${selected.skillPath}`);
        return;
      }

      if (redeployResult) {
        const skillDir = join('.features', selected.name, 'skill');
        const deployResult = await deployService.deploy(selected.name, skillDir);
        if (!deployResult.ok) {
          showError(`Redeploy failed: ${deployResult.error.message}`);
        } else {
          showInfo('Redeployed to .claude/skills/, .cursor/skills/, .agents/skills/');
        }
      }
    }

    const targetPath = target === 'kb' ? selected.kbPath : selected.skillPath;
    showOutro(`Updated ${targetPath}`);
  };
}
