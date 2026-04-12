import { join } from 'node:path';
import chalk from 'chalk';
import type { FeatureName, ClaudeModel, AppError } from '../types/index.js';
import { toFeatureName, resolveModel, stripFeaturePrefix } from '../types/index.js';
import { DEFAULT_MODEL } from '../lib/config.js';
import { deriveFeatureName } from '../lib/naming.js';
import { isCancelled } from '../lib/errors.js';
import type { KBService } from '../services/kb.service.js';
import type { SkillService } from '../services/skill.service.js';
import type { DeployService } from '../services/deploy.service.js';
import type { EditorClient } from '../clients/editor.client.js';
import {
  showIntro,
  showOutro,
  showDaatIntro,
  showDaatNote,
  askTopic,
  askFeatureName,
  showFeatureFolder,
  createSpinner,
  showError,
  showInfo,
  showKbNote,
  askKbReview,
} from '../ui/prompts.js';

interface CreateOptions {
  model?: string;
}

interface CreateDeps {
  kbService: KBService;
  skillService: SkillService;
  deployService: DeployService;
  editorClient: EditorClient;
}

function handleError(error: AppError): void {
  showError(error.message);
}

export function makeCreateCommand(deps: CreateDeps) {
  const { kbService, skillService, deployService, editorClient } = deps;

  return async function createCommand(topic: string | undefined, options: CreateOptions): Promise<void> {
    showIntro();

    let finalTopic = topic;
    if (!finalTopic) {
      const result = await askTopic();
      if (isCancelled(result)) {
        showOutro('Cancelled.');
        return;
      }
      finalTopic = result;
    }

    const suggested = deriveFeatureName(finalTopic);
    const nameResult = await askFeatureName(suggested);
    if (isCancelled(nameResult)) {
      showOutro('Cancelled.');
      return;
    }
    const featureName: FeatureName = toFeatureName(nameResult);
    const model: ClaudeModel = resolveModel(options.model, DEFAULT_MODEL);

    showFeatureFolder(join('.features', featureName));

    const spin = createSpinner();
    spin.start('Installing dependencies...');

    const installResult = await skillService.ensureSkillCreator();
    if (!installResult.ok) {
      spin.stop('Failed to install dependencies.');
      handleError(installResult.error);
      return;
    }
    spin.stop('Dependencies ready.');

    showInfo('Launching Claude Code with KB creator...');
    console.log();

    const kbResult = await kbService.createKB(featureName, finalTopic, model);
    if (!kbResult.ok) {
      console.log();
      handleError(kbResult.error);
      showOutro(`Partial feature at .features/${featureName}/`);
      return;
    }

    console.log();
    showKbNote(kbResult.value);

    const shortName = stripFeaturePrefix(featureName);

    while (true) {
      const review = await askKbReview(kbResult.value);

      if (isCancelled(review) || review === 'skip') {
        showInfo(`You can create the skill later with: features skill ${shortName}`);
        showOutro(`KB saved at .features/${featureName}/`);
        return;
      }

      if (review === 'edit') {
        const editResult = await editorClient.open(kbResult.value);
        if (!editResult.ok) {
          showError(`${editResult.error.message}. Set $EDITOR and try again, or edit the file manually.`);
        }
        continue;
      }

      break;
    }

    showInfo('Creating skill...');
    console.log();

    const skillResult = await skillService.createSkill({
      featureName,
      topic: finalTopic,
      kbPath: kbResult.value,
      model,
    });

    console.log();
    if (!skillResult.ok) {
      handleError(skillResult.error);
      showOutro(`Skill creation failed. KB was saved.`);
      return;
    }

    if (skillResult.value !== 0) {
      showOutro(`Skill creation exited with code ${skillResult.value}. KB was saved.`);
      return;
    }

    const skillExists = await deployService.skillDirExists(featureName);
    if (!skillExists) {
      showError('Skill directory not found. Skipping deployment.');
      showOutro(`Partially created at .features/${featureName}/`);
      return;
    }

    showDaatIntro();
    showInfo('Deploying feature to code agents...');
    console.log();

    const skillDir = join('.features', featureName, 'skill');
    const deployResult = await deployService.deploy(featureName, skillDir);
    if (!deployResult.ok) {
      showError(`Deployment failed: ${deployResult.error.message}`);
      showOutro(`Skill saved at .features/${featureName}/skill/ — deploy manually.`);
      return;
    }

    showDaatNote(featureName);
    showInfo(`Run ${chalk.hex('#7B68EE').bold('features')} to execute.`);
    showOutro(`${featureName} is ready.`);
  };
}
