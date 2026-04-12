import { spawn } from 'node:child_process';
import type { Result } from '../types/index.js';
import { ok, fail } from '../types/index.js';

export class EditorClient {
  open(filePath: string): Promise<Result<void>> {
    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';

    return new Promise((resolve) => {
      const child = spawn(editor, [filePath], {
        stdio: 'inherit',
      });

      child.on('error', (err) => {
        resolve(fail('EDITOR_FAILED', `Failed to open editor (${editor}): ${err.message}`, err));
      });

      child.on('close', () => {
        resolve(ok(undefined));
      });
    });
  }
}
