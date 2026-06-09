import { exec as execCb, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../types/index.js';
import { ok, fail } from '../types/index.js';

const exec = promisify(execCb);
const execFileAsync = promisify(execFile);

export class GitClient {
  private readonly repoDir: string;

  constructor(repoDir?: string) {
    this.repoDir = repoDir ?? process.cwd();
  }

  // --- Clone operations (used by existing skill/create commands) ---

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

  // --- Read-only queries (used by analysis pipeline) ---

  private async git(args: string[]): Promise<Result<string>> {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: this.repoDir, maxBuffer: 10 * 1024 * 1024 });
      return ok(stdout.trim());
    } catch (err) {
      return fail('GIT_FAILED', `git ${args[0]} failed: ${(err as Error).message}`, err);
    }
  }

  async headSha(): Promise<Result<string>> {
    return this.git(['rev-parse', '--short', 'HEAD']);
  }

  async blobSha(path: string): Promise<string | undefined> {
    const result = await this.git(['rev-parse', `HEAD:${path}`]);
    return result.ok ? result.value.slice(0, 7) : undefined;
  }

  async changedFilesSince(sha: string): Promise<Result<string[]>> {
    const result = await this.git(['diff', '--name-only', sha]);
    if (!result.ok) return result;
    return ok(result.value === '' ? [] : result.value.split('\n'));
  }

  async trackedFileCount(): Promise<number | undefined> {
    const result = await this.git(['ls-files']);
    if (!result.ok) return undefined;
    return result.value === '' ? 0 : result.value.split('\n').length;
  }

  async isRepo(): Promise<boolean> {
    const result = await this.git(['rev-parse', '--is-inside-work-tree']);
    return result.ok && result.value === 'true';
  }
}
