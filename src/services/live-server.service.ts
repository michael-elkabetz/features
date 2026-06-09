import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { MANIFEST_FILE } from '../lib/analysis-config.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import type { ClaudeModel, Result } from '../types/index.js';
import { fail, ok } from '../types/index.js';
import type { AnalyzeService, ProgressEvent } from './analyze.service.js';
import type { CompileService } from './compile.service.js';

interface LiveEvent extends ProgressEvent {
  readonly runId: number;
}

type Listener = (event: LiveEvent) => void;

/**
 * Phase-2 live mode: serves the viewer plus a small API to trigger analysis
 * from the browser and stream progress over SSE.
 */
export class LiveServerService {
  private listeners = new Set<Listener>();
  private running = false;
  private runId = 0;
  private log: LiveEvent[] = [];

  constructor(
    private readonly fs: FilesystemRepository,
    private readonly analyzeService: AnalyzeService,
    private readonly compileService: CompileService,
    private readonly viewerDistDir: string,
  ) {}

  start(port: number, model: ClaudeModel): Result<ServerType> {
    if (!existsSync(join(this.viewerDistDir, 'index.html'))) {
      return fail('SERVER_ERROR', `Viewer assets not found at ${this.viewerDistDir}.`);
    }

    const app = new Hono();

    app.get('/manifest.json', async (c) => {
      const manifest = await this.fs.readText(MANIFEST_FILE);
      if (!manifest.ok) return c.json({ error: 'No manifest — run an analysis first.' }, 404);
      return c.body(manifest.value, 200, { 'Content-Type': 'application/json' });
    });

    app.get('/api/status', (c) =>
      c.json({ live: true, analyzing: this.running, runId: this.runId, hasManifest: this.fs.existsSync(MANIFEST_FILE) }),
    );

    app.post('/api/analyze', async (c) => {
      if (this.running) return c.json({ error: 'An analysis is already running.', runId: this.runId }, 409);
      const body = (await c.req.json().catch(() => ({}))) as { feature?: string };
      this.runId += 1;
      this.log = [];
      void this.runAnalysis(model, body.feature); // fire and forget; progress flows over SSE
      return c.json({ runId: this.runId });
    });

    app.get('/api/analyze/events', (c) =>
      streamSSE(c, async (stream) => {
        // Replay the current run's log so late subscribers see full history.
        for (const event of this.log) {
          await stream.writeSSE({ event: event.kind, data: JSON.stringify(event) });
        }
        const listener: Listener = (event) => {
          void stream.writeSSE({ event: event.kind, data: JSON.stringify(event) });
        };
        this.listeners.add(listener);
        stream.onAbort(() => {
          this.listeners.delete(listener);
        });
        // Keep the connection open until the client disconnects.
        await new Promise<void>((resolve) => stream.onAbort(resolve));
      }),
    );

    app.use('/*', serveStatic({ root: this.viewerDistDir }));
    app.notFound(async (c) => {
      const index = await this.fs.readText(join(this.viewerDistDir, 'index.html'));
      return index.ok ? c.html(index.value) : c.text('Not found', 404);
    });

    return ok(serve({ fetch: app.fetch, port }));
  }

  private emit(event: ProgressEvent & { kind: ProgressEvent['kind'] | 'done' | 'error' }): void {
    const live = { ...event, runId: this.runId } as LiveEvent;
    this.log.push(live);
    for (const listener of this.listeners) listener(live);
  }

  private async runAnalysis(model: ClaudeModel, featureId?: string): Promise<void> {
    this.running = true;
    const onProgress = (e: ProgressEvent) => this.emit(e);
    try {
      let inventory;
      if (featureId) {
        const existing = await this.analyzeService.readInventory();
        if (!existing.ok) return this.emit({ kind: 'error' as never, message: existing.error.message });
        const entry = existing.value.find((e) => e.id === featureId);
        if (!entry) return this.emit({ kind: 'error' as never, message: `Unknown feature "${featureId}".` });
        inventory = [entry];
      } else {
        this.emit({ kind: 'phase', message: 'Pass 1/2 — discovering areas and features…' });
        const result = await this.analyzeService.runInventory(model, onProgress);
        if (!result.ok) return this.emit({ kind: 'error' as never, message: result.error.message });
        inventory = result.value;
        this.emit({ kind: 'phase', message: `Inventory: ${inventory.length} feature(s).` });
      }

      for (let i = 0; i < inventory.length; i++) {
        const entry = inventory[i]!;
        this.emit({ kind: 'phase', message: `Pass 2/2 — [${i + 1}/${inventory.length}] ${entry.name}…` });
        const result = await this.analyzeService.runDeepDive(entry, model, onProgress);
        if (!result.ok) this.emit({ kind: 'warn', message: `${entry.id}: ${result.error.message}` });
      }

      this.emit({ kind: 'phase', message: 'Compiling manifest…' });
      const compiled = await this.compileService.compile();
      if (!compiled.ok) {
        return this.emit({
          kind: 'error' as never,
          message: typeof compiled.error === 'string' ? compiled.error : 'Compile failed — spec violations.',
        });
      }
      const s = compiled.value;
      this.emit({
        kind: 'done' as never,
        message: `Compiled ${s.features} feature(s) — ${s.verified} verified, ${s.healed} healed, ${s.stale} stale.`,
      });
    } finally {
      this.running = false;
    }
  }
}
