import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { AnalysisCache } from '../lib/cache.js';
import { ANALYSIS_DIR, COMBINED_PROMPT_PATH } from '../lib/analysis-config.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import type { AnalysisStats, AnalyzeService, InventoryEntry, ProgressObserver } from '../services/analyze.service.js';
import type { CompileService } from '../services/compile.service.js';
import type { GitClient } from '../clients/git.client.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import { resolveModel } from '../types/index.js';
import { createProgressBar, createSpinner, showAnalyzeIntro, showError, showInfo, showOutro, showSuccess, showWarn } from '../ui/prompts.js';

const QUIET: ProgressObserver = () => {};

function formatStats(stats: AnalysisStats, featureCount: number, skippedCount: number): string {
  const analyzed = featureCount - skippedCount;
  const parts: string[] = [];
  parts.push(`Features: ${featureCount}${skippedCount > 0 ? ` (${skippedCount} cached, ${analyzed} analyzed)` : ''}`);
  parts.push(`Claude calls: ${stats.callCount}${stats.repairCount > 0 ? ` (${stats.repairCount} repairs)` : ''}`);
  if (stats.totalInputTokens > 0 || stats.totalOutputTokens > 0) {
    const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
    const tokens = [`${fmt(stats.totalInputTokens)} in`, `${fmt(stats.totalOutputTokens)} out`];
    if (stats.totalCacheReadTokens > 0) tokens.push(`${fmt(stats.totalCacheReadTokens)} cache-read`);
    parts.push(`Tokens: ${tokens.join(' / ')}`);
  }
  if (stats.totalCostUsd > 0) {
    parts.push(`Cost: $${stats.totalCostUsd.toFixed(2)}`);
  }
  if (stats.totalDurationMs > 0) {
    const secs = Math.round(stats.totalDurationMs / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    parts.push(`Duration: ${m > 0 ? `${m}m ${s}s` : `${s}s`}`);
  }
  return parts.join('\n  ');
}

interface InitDeps {
  analyzeService: AnalyzeService;
  compileService: CompileService;
  gitClient: GitClient;
  fs: FilesystemRepository;
  rootDir: string;
}

interface InitOptions {
  model?: string;
  feature?: string;
  skipCompile?: boolean;
  concurrency?: string;
  cache?: boolean;
}

const DEFAULT_CONCURRENCY = 4;

function waitForEnterOrExit(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin });
    const exitHandler = () => { rl.close(); process.exit(130); };
    process.on('SIGINT', exitHandler);
    rl.once('line', () => {
      process.off('SIGINT', exitHandler);
      rl.close();
      resolve();
    });
  });
}

const OLD_ANALYSIS_DIR = '.code-explain';
const MIGRATION_ITEMS = ['overview.md', 'features', 'skills', 'manifest.json', '.cache.json'];

async function migrateFromCodeExplain(fs: FilesystemRepository): Promise<void> {
  const hasOld = await fs.exists(`${OLD_ANALYSIS_DIR}/overview.md`);
  const hasNew = await fs.exists(`${ANALYSIS_DIR}/overview.md`);
  if (!hasOld || hasNew) return;

  showInfo('Migrating analysis data from .code-explain/ to .features/…');
  await fs.ensureDir(ANALYSIS_DIR);
  for (const item of MIGRATION_ITEMS) {
    if (await fs.exists(`${OLD_ANALYSIS_DIR}/${item}`)) {
      await fs.copy(`${OLD_ANALYSIS_DIR}/${item}`, `${ANALYSIS_DIR}/${item}`);
    }
  }
  showSuccess('Migration complete. You can safely remove .code-explain/ when ready.');
}

export function makeInitCommand(deps: InitDeps) {
  const { analyzeService, compileService, gitClient, fs, rootDir } = deps;

  return async function initCommand(options: InitOptions): Promise<void> {
    showAnalyzeIntro('init');
    await migrateFromCodeExplain(fs);
    const model = resolveModel(options.model, 'claude-opus-4-6');
    showInfo(`Model: ${model}`);
    const useCache = options.cache !== false;
    analyzeService.resetStats();

    let inventory: InventoryEntry[];

    if (options.feature) {
      const existing = await analyzeService.readInventory();
      if (!existing.ok) {
        showError(existing.error.message);
        process.exitCode = 1;
        return;
      }
      const entry = existing.value.find((e) => e.id === options.feature);
      if (!entry) {
        showError(`Feature "${options.feature}" is not in the inventory. Known ids: ${existing.value.map((e) => e.id).join(', ')}`);
        process.exitCode = 1;
        return;
      }
      inventory = [entry];
    } else {
      let resumed = false;
      if (useCache) {
        const existing = await analyzeService.readInventory();
        if (existing.ok) {
          inventory = existing.value;
          resumed = true;
          showSuccess(`Resuming from previous inventory (${inventory.length} features). Use --no-cache to re-discover.`);
        }
      }

      if (!resumed) {
        while (true) {
          const ac = new AbortController();
          const sigintHandler = () => { ac.abort(); };
          process.on('SIGINT', sigintHandler);

          const spin = createSpinner();
          spin.start('Pass 1/2 — discovering areas and features…');
          const result = await analyzeService.runInventory(model, QUIET, ac.signal);

          process.off('SIGINT', sigintHandler);

          if (result.ok) {
            spin.stop('Inventory complete.');
            inventory = result.value;
            showSuccess(`Inventory: ${inventory.length} feature(s) across the repo.`);
            break;
          }
          const aborted = result.error.code === 'CLAUDE_ABORTED';
          spin.stop(aborted ? 'Paused.' : 'Failed.');
          if (aborted) {
            showInfo('Press Enter to resume (Ctrl+C to exit)…');
          } else {
            showWarn(`Inventory failed: ${result.error.message}`);
            showInfo('Press Enter to retry when quota resets (Ctrl+C to exit)…');
          }
          await waitForEnterOrExit();
          showInfo('Retrying inventory…');
        }
      }
    }

    const concurrency = Math.max(1, parseInt(options.concurrency ?? '', 10) || DEFAULT_CONCURRENCY);

    let cache: AnalysisCache | null = null;
    let changedFiles: Set<string> | null = null;
    if (useCache) {
      const promptContent = await readFile(COMBINED_PROMPT_PATH, 'utf-8').catch(() => '');
      cache = await AnalysisCache.load(rootDir, promptContent);
      const sha = await gitClient.headSha();
      if (sha.ok) {
        const changed = await gitClient.changedFilesSince(sha.value);
        changedFiles = new Set(changed.ok ? changed.value : []);
      }
    }

    // Build the repo map once (AI-free): symbol index + import graph for context pre-feed.
    {
      const spin = createSpinner();
      spin.start('Mapping repository (symbols + imports)…');
      try {
        const { buildRepoMap } = await import('../codemap/index.js');
        const files = await gitClient.listFiles();
        if (files.ok) {
          const map = await buildRepoMap(rootDir, files.value);
          analyzeService.setRepoMap(map);
          spin.stop(`Mapped ${map.files.length} source file(s).`);
        } else {
          spin.stop('Skipped repo map (git listing unavailable).');
        }
      } catch {
        spin.stop('Skipped repo map (continuing without pre-fed context).');
      }
    }

    showInfo(`Pass 2/2 — analyzing ${inventory.length} feature(s) with concurrency ${concurrency}…`);

    const completed = new Set<string>();
    let skippedCount = 0;
    let failures: string[] = [];

    while (true) {
      const ac = new AbortController();
      let paused = false;
      const sigintHandler = () => { paused = true; ac.abort(); };
      process.on('SIGINT', sigintHandler);

      failures = [];
      let iterationSkipped = 0;
      const progress = createProgressBar(inventory.length);

      await mapWithConcurrency(inventory, concurrency, async (entry) => {
        if (completed.has(entry.id)) {
          progress.skip(`${entry.id} (cached)`);
          iterationSkipped++;
          return;
        }

        if (cache && changedFiles) {
          const refPaths = await analyzeService.featureRefPaths(entry.id);
          if (refPaths.length > 0 && cache.isValid(entry, changedFiles, refPaths)) {
            progress.skip(`${entry.id} (cached)`);
            completed.add(entry.id);
            iterationSkipped++;
            return;
          }
        }

        progress.update(entry.name);
        const result = await analyzeService.runCombinedFeature(entry, model, QUIET, ac.signal);
        if (!result.ok) {
          if (!paused) failures.push(entry.id);
          return;
        }

        completed.add(entry.id);
        if (cache) {
          const sha = await gitClient.headSha();
          if (sha.ok) cache.update(entry, sha.value);
          await cache.save().catch(() => {});
        }
      }, ac.signal);

      process.off('SIGINT', sigintHandler);
      progress.done();

      if (!paused) {
        skippedCount = iterationSkipped;
        break;
      }

      if (cache) await cache.save().catch(() => {});

      const remaining = inventory.length - completed.size;
      if (remaining === 0) {
        skippedCount = iterationSkipped;
        break;
      }

      showWarn(`Paused — ${completed.size}/${inventory.length} features completed.`);
      showInfo('Press Enter to resume (Ctrl+C to exit)…');
      await waitForEnterOrExit();
      showInfo(`Resuming — ${remaining} feature(s) remaining…`);
    }

    if (cache) await cache.save().catch(() => {});

    if (failures.length > 0) {
      showWarn(`${failures.length} feature(s) failed: ${failures.join(', ')}`);
    }
    if (failures.length === inventory.length) {
      showError('No feature files were produced.');
      process.exitCode = 1;
      return;
    }

    if (!options.skipCompile) {
      showInfo('Compiling manifest…');
      const compiled = await compileService.compile();
      if (!compiled.ok) {
        showError(typeof compiled.error === 'string' ? compiled.error : 'Compile failed — run validation for details.');
        process.exitCode = 1;
        return;
      }
      const s = compiled.value;
      showSuccess(
        `Compiled ${s.features} feature(s) — refs: ${s.verified} verified, ${s.healed} healed, ${s.stale} stale.`,
      );
    }

    const stats = analyzeService.stats;
    if (stats.callCount > 0 || skippedCount > 0) {
      showInfo(`\n  ${formatStats(stats, inventory.length, skippedCount)}`);
    }
    showOutro('Analysis complete. Run `features serve` to browse it.');
  };
}
