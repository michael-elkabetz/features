import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../types/index.js';
import { ok, fail } from '../types/index.js';

const exec = promisify(execCb);

export class GitClient {
  async sparseClone(repo: string, subpath: string, dest: string): Promise<Result<void>> {
    try {
      await exec(`git clone --depth 1 --filter=blob:none --sparse "${repo}" "${dest}"`);
      await exec(`git -C "${dest}" sparse-checkout set "${subpath}"`);
      return ok(undefined);
    } catch (err) {
      return fail('GIT_FAILED', `Sparse clone failed for ${repo}`, err);
    }
  }

  async shallowClone(repo: string, dest: string): Promise<Result<void>> {
    try {
      await exec(`git clone --depth 1 "${repo}" "${dest}"`);
      return ok(undefined);
    } catch (err) {
      return fail('GIT_FAILED', `Shallow clone failed for ${repo}`, err);
    }
  }
}
