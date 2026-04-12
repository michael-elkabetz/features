import { readFile, writeFile, access, mkdir, cp, readdir, stat, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Result } from '../types/index.js';
import { ok, fail } from '../types/index.js';
import { toAppError } from '../lib/errors.js';

export class FilesystemRepository {
  constructor(private readonly rootDir: string) {}

  get root(): string {
    return this.rootDir;
  }

  resolve(...segments: string[]): string {
    return resolve(this.rootDir, ...segments);
  }

  async readText(path: string): Promise<Result<string>> {
    try {
      const content = await readFile(this.resolve(path), 'utf-8');
      return ok(content);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to read ${path}`, err);
    }
  }

  async writeText(path: string, content: string): Promise<Result<void>> {
    try {
      await writeFile(this.resolve(path), content, 'utf-8');
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to write ${path}`, err);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }

  existsSync(path: string): boolean {
    return existsSync(this.resolve(path));
  }

  async ensureDir(path: string): Promise<Result<void>> {
    try {
      await mkdir(this.resolve(path), { recursive: true });
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to create directory ${path}`, err);
    }
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<Result<void>> {
    try {
      await cp(this.resolve(src), this.resolve(dest), { recursive: options?.recursive ?? true });
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to copy ${src} to ${dest}`, err);
    }
  }

  async copyFile(src: string, dest: string): Promise<Result<void>> {
    try {
      await copyFile(this.resolve(src), this.resolve(dest));
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to copy file ${src} to ${dest}`, err);
    }
  }

  async copyAbsolute(absSrc: string, absDest: string): Promise<Result<void>> {
    try {
      await cp(absSrc, absDest, { recursive: true });
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to copy ${absSrc} to ${absDest}`, err);
    }
  }

  async copyFileAbsolute(absSrc: string, absDest: string): Promise<Result<void>> {
    try {
      await copyFile(absSrc, absDest);
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to copy file to ${absDest}`, err);
    }
  }

  async listDir(path: string): Promise<Result<string[]>> {
    try {
      const entries = await readdir(this.resolve(path));
      return ok(entries);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to list directory ${path}`, err);
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const s = await stat(this.resolve(path));
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  async remove(path: string): Promise<Result<void>> {
    try {
      await rm(this.resolve(path), { recursive: true, force: true });
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to remove ${path}`, err);
    }
  }

  async removeAbsolute(absPath: string): Promise<Result<void>> {
    try {
      await rm(absPath, { recursive: true, force: true });
      return ok(undefined);
    } catch (err) {
      return fail('FILESYSTEM_ERROR', `Failed to remove ${absPath}`, err);
    }
  }
}
