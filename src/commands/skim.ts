import { readFile } from 'node:fs/promises';
import { skimOrRaw } from '../skim/index.js';
import type { SkimMode } from '../skim/index.js';

interface SkimOptions {
  mode?: string;
  maxChars?: string;
}

export function makeSkimCommand() {
  return async function skimCommand(filePath: string | undefined, options: SkimOptions): Promise<void> {
    const mode: SkimMode = (options.mode as SkimMode) ?? 'structure';
    const maxChars = options.maxChars ? parseInt(options.maxChars, 10) : undefined;

    let source: string;
    let resolvedPath: string;

    if (filePath) {
      source = await readFile(filePath, 'utf-8');
      resolvedPath = filePath;
    } else {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      source = Buffer.concat(chunks).toString('utf-8');
      resolvedPath = '<stdin>';
    }

    const result = await skimOrRaw(source, resolvedPath, mode, maxChars);
    process.stdout.write(result);
    if (!result.endsWith('\n')) process.stdout.write('\n');
  };
}
