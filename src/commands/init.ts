import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { AnalysisCache } from '../lib/cache.js';
import { ANALYSIS_DIR, COMBINED_PROMPT_PATH } from '../lib/analysis-config.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import type { AnalysisStats, AnalyzeService, InventoryEntry } from '../services/analyze.service.js';
import type { CompileService } from '../services/compile.service.js';
import type { GitClient } from '../clients/git.client.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import { resolveModel } from '../types/index.js';
import { showAnalyzeIntro, showError, showInfo, showOutro, showSuccess, showWarn } from '../ui/prompts.js';

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
  noCache?: boolean;
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
    const model = resolveModel(options.model, 'sonnet');
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
      while (true) {
        showInfo('Pass 1/2 — discovering areas and features…');
        const result = await analyzeService.runInventory(model);
        if (result.ok) {
          inventory = result.value;
          showSuccess(`Inventory: ${inventory.length} feature(s) across the repo.`);
          break;
        }
        showWarn(`Inventory failed: ${result.error.message}`);
        showInfo(chalk.bold('Press Enter to retry when quota resets (Ctrl+C to exit)…'));
        await waitForEnterOrExit();
        showInfo('Retrying inventory…');
      }
    }

    const concurrency = Math.max(1, parseInt(options.concurrency ?? '', 10) || DEFAULT_CONCURRENCY);
    const useCache = !options.noCache;

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

    showInfo(`Pass 2/2 — analyzing ${inventory.length} feature(s) with concurrency ${concurrency}…`);

    let skippedCount = 0;
    const failures: string[] = [];
    let completed = false;

    while (!completed) {
      const ac = new AbortController();
      let paused = false;

      const sigintHandler = () => {
        paused = true;
        ac.abort();
        showWarn('\nPausing after in-flight features complete…');
      };
      process.on('SIGINT', sigintHandler);

      await mapWithConcurrency(inventory, concurrency, async (entry, i) => {
        if (cache && changedFiles) {
          const refPaths = await analyzeService.featureRefPaths(entry.id);
          if (refPaths.length > 0 && cache.isValid(entry, changedFiles, refPaths)) {
            showInfo(`[${i + 1}/${inventory.length}] ${chalk.dim(entry.id)} (cached, skipping)`);
            skippedCount++;
            return;
          }
        }

        showInfo(`[${i + 1}/${inventory.length}] ${chalk.bold(entry.name)} (${entry.id})…`);
        const result = await analyzeService.runCombinedFeature(entry, model);
        if (!result.ok) {
          failures.push(entry.id);
          if (!paused) {
            showWarn(`  ${entry.id}: ${result.error.message}`);
          }
          return;
        }

        if (cache) {
          const sha = await gitClient.headSha();
          if (sha.ok) cache.update(entry, sha.value);
        }
      }, ac.signal);

      process.off('SIGINT', sigintHandler);

      if (!paused) {
        completed = true;
        continue;
      }

      if (cache) await cache.save().catch(() => {});
      const pauseStats = analyzeService.stats;
      if (pauseStats.callCount > 0 || skippedCount > 0) {
        showInfo(`\n  Progress so far: ${formatStats(pauseStats, inventory.length, skippedCount)}`);
      }

      showInfo(chalk.bold('Press Enter to resume when quota resets (Ctrl+C to exit)…'));
      await waitForEnterOrExit();

      showInfo('Resuming analysis…');
      analyzeService.resetStats();
      skippedCount = 0;
      failures.length = 0;
    }

    if (cache) await cache.save().catch(() => {});

    if (failures.length > 0) {
      showWarn(`${failures.length} feature(s) failed validation and were skipped: ${failures.join(', ')}`);
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
