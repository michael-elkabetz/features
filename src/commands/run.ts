import type { ClaudeModel } from '../types/index.js';
import { resolveModel } from '../types/index.js';
import { DEFAULT_MODEL } from '../lib/config.js';
import { isCancelled } from '../lib/errors.js';
import type { FeatureService } from '../services/feature.service.js';
import {
  showRunIntro,
  showOutro,
  showError,
  showInfo,
  askSelectFeature,
  askRunTask,
} from '../ui/prompts.js';

interface RunOptions {
  model?: string;
}

interface RunDeps {
  featureService: FeatureService;
}

export function makeRunCommand(deps: RunDeps) {
  const { featureService } = deps;

  return async function runCommand(options: RunOptions): Promise<void> {
    showRunIntro();

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

    let selectedName: string;

    if (features.length === 1) {
      selectedName = features[0].name;
      showInfo(`Using ${selectedName}`);
    } else {
      const result = await askSelectFeature(features);
      if (isCancelled(result)) {
        showOutro('Cancelled.');
        return;
      }
      selectedName = result;
    }

    const selected = features.find((f) => f.name === selectedName);
    if (!selected) {
      showError(`Feature "${selectedName}" not found.`);
      showOutro();
      return;
    }

    const taskResult = await askRunTask(selected);
    if (isCancelled(taskResult)) {
      showOutro('Cancelled.');
      return;
    }

    const model: ClaudeModel = resolveModel(options.model, DEFAULT_MODEL);

    const result = await featureService.executeFeature(selected, taskResult, model);
    if (!result.ok) {
      showError(result.error.message);
    }
  };
}
