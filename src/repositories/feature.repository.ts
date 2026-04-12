import { join } from 'node:path';
import type { Result, Feature, FeatureName } from '../types/index.js';
import { ok, fail, toFeatureName } from '../types/index.js';
import type { FilesystemRepository } from './filesystem.repository.js';

export class FeatureRepository {
  constructor(private readonly fs: FilesystemRepository) {}

  async findAll(): Promise<Result<Feature[]>> {
    const listResult = await this.fs.listDir('.features');
    if (!listResult.ok) {
      return ok([]);
    }

    const features: Feature[] = [];

    for (const entry of listResult.value) {
      if (!entry.startsWith('features-')) continue;

      const kbPath = join('.features', entry, 'kb', 'knowledge.md');
      const legacyKbPath = join('.features', entry, 'knowledge', 'knowledge.md');
      const skillPath = join('.features', entry, 'skill', 'SKILL.md');

      const kbExists = await this.fs.exists(kbPath);
      const legacyKbExists = !kbExists && await this.fs.exists(legacyKbPath);

      if (!kbExists && !legacyKbExists) continue;

      const resolvedKbPath = kbExists ? kbPath : legacyKbPath;
      const hasSkill = await this.fs.exists(skillPath);

      features.push({
        name: toFeatureName(entry),
        kbPath: resolvedKbPath,
        skillPath,
        hasSkill,
      });
    }

    return ok(features.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async findByName(name: FeatureName): Promise<Result<Feature>> {
    const featuresResult = await this.findAll();
    if (!featuresResult.ok) return featuresResult;

    const found = featuresResult.value.find((f) => f.name === name);
    if (!found) {
      return fail('FEATURE_NOT_FOUND', `Feature "${name}" not found`);
    }

    return ok(found);
  }

  async readKB(feature: Feature): Promise<Result<string>> {
    return this.fs.readText(feature.kbPath);
  }
}
