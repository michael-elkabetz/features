import chalk from 'chalk';
import { DEFAULT_SERVE_PORT } from '../lib/analysis-config.js';
import type { LiveServerService } from '../services/live-server.service.js';
import type { ServeService } from '../services/serve.service.js';
import { resolveModel } from '../types/index.js';
import { showAnalyzeIntro, showError, showInfo } from '../ui/prompts.js';

interface ServeDeps {
  serveService: ServeService;
  liveServerService: LiveServerService;
}

interface ServeOptions {
  port?: string;
  live?: boolean;
  model?: string;
}

export function makeServeCommand(deps: ServeDeps) {
  const { serveService, liveServerService } = deps;

  return async function serveCommand(options: ServeOptions): Promise<void> {
    showAnalyzeIntro(options.live ? 'serve --live' : 'serve');

    const port = Number(options.port ?? DEFAULT_SERVE_PORT);
    const result = options.live
      ? liveServerService.start(port, resolveModel(options.model, 'sonnet'))
      : serveService.start(port);
    if (!result.ok) {
      showError(result.error.message);
      process.exitCode = 1;
      return;
    }

    showInfo(`Browsing at ${chalk.bold(`http://localhost:${port}`)} — press Ctrl-C to stop.`);
    if (options.live) showInfo('Live mode: trigger re-analysis from the UI.');
  };
}
