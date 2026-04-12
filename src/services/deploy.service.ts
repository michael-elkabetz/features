import { join } from 'node:path';
import type { Result, FeatureName } from '../types/index.js';
import { ok } from '../types/index.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';

export interface DeployResult {
  readonly deployedPaths: string[];
}

export class DeployService {
  constructor(private readonly fs: FilesystemRepository) {}

  async deploy(
    featureName: FeatureName,
    skillSourceDir: string,
  ): Promise<Result<DeployResult>> {
    const destinations = [
      join('.claude', 'skills', featureName),
      join('.cursor', 'skills', featureName),
      join('.agents', 'skills', featureName),
    ];

    const deployedPaths: string[] = [];

    for (const dest of destinations) {
      const ensureResult = await this.fs.ensureDir(dest);
      if (!ensureResult.ok) return ensureResult;

      const copyResult = await this.fs.copy(skillSourceDir, dest);
      if (!copyResult.ok) return copyResult;

      deployedPaths.push(dest);
    }

    return ok({ deployedPaths });
  }

  async skillDirExists(featureName: FeatureName): Promise<boolean> {
    const skillDir = join('.features', featureName, 'skill');
    return this.fs.isDirectory(skillDir);
  }
}
