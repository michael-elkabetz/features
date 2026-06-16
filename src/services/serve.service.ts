import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { ANALYSIS_DIR, ANALYSIS_FEATURES_DIR, MANIFEST_FILE, SKILLS_DIR } from '../lib/analysis-config.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import type { Result } from '../types/index.js';
import { fail, ok } from '../types/index.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.md': 'text/plain; charset=utf-8',
};

export class ServeService {
  constructor(
    private readonly fs: FilesystemRepository,
    private readonly viewerDistDir: string,
  ) {}

  /** Serve the bundled viewer + the repo's manifest.json on the given port. */
  start(port: number): Result<Server> {
    if (!existsSync(join(this.viewerDistDir, 'index.html'))) {
      return fail(
        'SERVER_ERROR',
        `Viewer assets not found at ${this.viewerDistDir}. Reinstall features CLI.`,
      );
    }
    if (!this.fs.existsSync(MANIFEST_FILE)) {
      return fail('SERVER_ERROR', 'manifest.json not found — run `features init` first.');
    }

    const server = createServer((req, res) => this.handle(req, res));
    server.listen(port);
    return ok(server);
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = (req.url ?? '/').split('?')[0]!;

    if (url === '/manifest.json') {
      this.sendFile(res, this.fs.resolve(MANIFEST_FILE));
      return;
    }

    const docMatch = url.match(/^\/api\/doc\/([a-z0-9-]+)\/(feature|skill)$/);
    if (docMatch) {
      const docPath = this.docPath(docMatch[1]!, docMatch[2]!);
      if (docPath) this.sendFile(res, docPath);
      else {
        res.statusCode = 404;
        res.end('Not found');
      }
      return;
    }

    const skillMatch = url.match(/^\/api\/skill\/([a-z0-9-]+)$/);
    if (skillMatch) {
      const skillPath = this.docPath(skillMatch[1]!, 'skill');
      if (skillPath) this.sendFile(res, skillPath);
      else {
        res.statusCode = 404;
        res.end('Not found');
      }
      return;
    }

    // Static viewer assets; anything unknown falls back to index.html (SPA).
    const safePath = normalize(url).replace(/^(\.\.[/\\])+/, '');
    const assetPath = join(this.viewerDistDir, safePath === '/' ? 'index.html' : safePath);
    if (assetPath.startsWith(this.viewerDistDir) && existsSync(assetPath) && statSync(assetPath).isFile()) {
      this.sendFile(res, assetPath);
      return;
    }
    this.sendFile(res, join(this.viewerDistDir, 'index.html'));
  }

  private docPath(featureId: string, kind: string): string | undefined {
    if (kind === 'feature') return this.fs.resolve(join(ANALYSIS_FEATURES_DIR, `${featureId}.md`));
    const flat = this.fs.resolve(join(SKILLS_DIR, `${featureId}.md`));
    const nested = this.fs.resolve(join(ANALYSIS_DIR, featureId, 'skill', 'SKILL.md'));
    return existsSync(flat) ? flat : existsSync(nested) ? nested : undefined;
  }

  private sendFile(res: ServerResponse, path: string): void {
    res.setHeader('Content-Type', MIME[extname(path)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(path)
      .on('error', () => {
        res.statusCode = 404;
        res.end('Not found');
      })
      .pipe(res);
  }
}
