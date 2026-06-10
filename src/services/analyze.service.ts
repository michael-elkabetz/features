import { z } from 'zod';
import { type Issue, SLUG_PATTERN, parseFeature, parseOverview } from '../spec/index.js';
import type { ClaudeClient } from '../clients/claude.client.js';
import type { GitClient } from '../clients/git.client.js';
import {
  COMBINED_PROMPT_PATH,
  DEEPDIVE_PROMPT_PATH,
  ANALYSIS_FEATURES_DIR,
  FEATURE_SKILL_PROMPT_PATH,
  INVENTORY_FILE,
  INVENTORY_PROMPT_PATH,
  OVERVIEW_FILE,
  SKILLS_DIR,
} from '../lib/analysis-config.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import type { ClaudeModel, ClaudeResult, Result } from '../types/index.js';
import { fail, ok } from '../types/index.js';

export interface AnalysisStats {
  readonly totalCostUsd: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalDurationMs: number;
  readonly totalTurns: number;
  readonly callCount: number;
  readonly repairCount: number;
}

export const InventoryEntrySchema = z.object({
  id: z.string().regex(SLUG_PATTERN),
  area: z.string().regex(SLUG_PATTERN),
  name: z.string().min(1),
  summary: z.string().min(1),
});
export const InventorySchema = z.array(InventoryEntrySchema).min(1);
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

/** Progress events forwarded to live-mode SSE clients (terminal mode renders directly). */
export interface ProgressEvent {
  readonly kind: 'phase' | 'tool' | 'text' | 'warn';
  readonly message: string;
}
export type ProgressObserver = (event: ProgressEvent) => void;

const MAX_REPAIRS = 2;

function budgetHint(fileCount: number): string {
  if (fileCount < 200) return `This is a small repo (~${fileCount} files). Keep exploration minimal — 1-2 directory scans max.`;
  if (fileCount < 2000) return `This is a medium repo (~${fileCount} files). Moderate exploration — scan entry points, avoid recursive reads.`;
  return `This is a large repo (~${fileCount} files). Full exploration allowed.`;
}

const CODEGRAPH_ADDENDUM = [
  '## Codegraph Available',
  'This repo has a codegraph index (.codegraph/). Use codegraph_explore as your PRIMARY',
  'tool for discovering features and tracing flows — one call with symbol names replaces',
  'multiple file reads. Use codegraph_search for symbol lookup. Only fall back to',
  'Read/Grep for details codegraph didn\'t cover.',
].join('\n');

export class AnalyzeService {
  private _stats = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, durationMs: 0, turns: 0, calls: 0, repairs: 0 };

  constructor(
    private readonly fs: FilesystemRepository,
    private readonly git: GitClient,
    private readonly claude: ClaudeClient,
  ) {}

  /** Snapshot of accumulated token/cost stats across all Claude calls in this service instance. */
  get stats(): AnalysisStats {
    return {
      totalCostUsd: this._stats.costUsd,
      totalInputTokens: this._stats.inputTokens,
      totalOutputTokens: this._stats.outputTokens,
      totalCacheReadTokens: this._stats.cacheReadTokens,
      totalDurationMs: this._stats.durationMs,
      totalTurns: this._stats.turns,
      callCount: this._stats.calls,
      repairCount: this._stats.repairs,
    };
  }

  resetStats(): void {
    this._stats = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, durationMs: 0, turns: 0, calls: 0, repairs: 0 };
  }

  private trackCall(result: ClaudeResult, isRepair = false): void {
    this._stats.costUsd += result.costUsd ?? 0;
    this._stats.inputTokens += result.inputTokens ?? 0;
    this._stats.outputTokens += result.outputTokens ?? 0;
    this._stats.cacheReadTokens += result.cacheReadTokens ?? 0;
    this._stats.durationMs += result.durationMs ?? 0;
    this._stats.turns += result.numTurns ?? 0;
    this._stats.calls++;
    if (isRepair) this._stats.repairs++;
  }

  /** Translate Claude stream events into coarse progress events for an observer. */
  private claudeObserver(onProgress: ProgressObserver | undefined) {
    if (!onProgress) return undefined;
    return (event: import('../types/index.js').ClaudeStreamEvent) => {
      if (event.type === 'assistant') {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'tool_use') {
            const input = block.input ?? {};
            const detail = (input['file_path'] ?? input['pattern'] ?? input['description'] ?? '') as string;
            onProgress({ kind: 'tool', message: `${block.name} ${detail}`.trim() });
          }
        }
      }
    };
  }

  /** Pass 1 — discover areas + feature inventory; writes overview.md and _inventory.json. */
  async runInventory(model: ClaudeModel, onProgress?: ProgressObserver): Promise<Result<InventoryEntry[]>> {
    if (!(await this.git.isRepo())) {
      return fail('ANALYSIS_FAILED', 'Not a git repository — features init needs git for staleness tracking.');
    }
    const sha = await this.git.headSha();
    if (!sha.ok) return sha;

    const featureDirResult = await this.fs.ensureDir(ANALYSIS_FEATURES_DIR);
    if (!featureDirResult.ok) return featureDirResult;
    const skillDirResult = await this.fs.ensureDir(SKILLS_DIR);
    if (!skillDirResult.ok) return skillDirResult;

    const fileCount = (await this.git.trackedFileCount()) ?? 0;
    const hasCodegraph = await this.fs.exists('.codegraph');

    const userPrompt = [
      `Analyze the repository at the current working directory.`,
      ``,
      `Write your two deliverables to exactly these paths:`,
      `1. ${OVERVIEW_FILE}`,
      `2. ${INVENTORY_FILE}`,
      ``,
      `Use this git sha as analyzedAt: ${sha.value}`,
      ``,
      budgetHint(fileCount),
    ].join('\n');

    const run = await this.claude.execute({
      systemPromptFile: INVENTORY_PROMPT_PATH,
      userPrompt,
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress),
      appendSystemPrompt: hasCodegraph ? CODEGRAPH_ADDENDUM : undefined,
    });
    if (!run.ok) return run;
    this.trackCall(run.value);

    // Validate both outputs; one focused repair turn on failure.
    for (let attempt = 0; ; attempt++) {
      const problems = await this.inventoryProblems();
      if (problems.length === 0) break;
      if (attempt >= MAX_REPAIRS) {
        return fail('ANALYSIS_FAILED', `Inventory output is invalid after ${MAX_REPAIRS} repairs:\n${problems.join('\n')}`);
      }
      onProgress?.({ kind: 'warn', message: `Inventory has ${problems.length} validation problem(s) — repairing…` });
      const repair = await this.claude.execute({
        systemPromptFile: INVENTORY_PROMPT_PATH,
        userPrompt: [
          `Your previous output in ${OVERVIEW_FILE} and ${INVENTORY_FILE} has validation errors.`,
          `Fix the files in place. Errors:`,
          ...problems.map((p) => `- ${p}`),
        ].join('\n'),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress),
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }

    return this.readInventory();
  }

  /** Pass 2 — deep-dive one feature; writes features/<id>.md with a validate→repair loop. */
  async runDeepDive(entry: InventoryEntry, model: ClaudeModel, onProgress?: ProgressObserver): Promise<Result<void>> {
    const sha = await this.git.headSha();
    if (!sha.ok) return sha;

    const filePath = `${ANALYSIS_FEATURES_DIR}/${entry.id}.md`;
    const baseLines = [
      `Deep-dive the feature "${entry.name}" (id: ${entry.id}) of this repository.`,
      `It belongs to area "${entry.area}". Its one-line summary from the inventory:`,
      `"${entry.summary}"`,
      ``,
      `Write the knowledge file to exactly this path: ${filePath}`,
      `Use this git sha for analyzedAt and every ref's sha field: ${sha.value}`,
      ``,
      `Feature ids that exist (for the related list): see ${INVENTORY_FILE}.`,
    ];

    const run = await this.claude.execute({
      systemPromptFile: DEEPDIVE_PROMPT_PATH,
      userPrompt: baseLines.join('\n'),
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress),
    });
    if (!run.ok) return run;
    this.trackCall(run.value);

    for (let attempt = 0; ; attempt++) {
      const problems = await this.featureProblems(filePath, entry);
      if (problems.length === 0) return ok(undefined);
      if (attempt >= MAX_REPAIRS) {
        return fail(
          'ANALYSIS_FAILED',
          `features/${entry.id}.md is invalid after ${MAX_REPAIRS} repairs:\n${problems.map((i) => `- ${i.code}: ${i.message}`).join('\n')}`,
        );
      }
      onProgress?.({ kind: 'warn', message: `${entry.id} has ${problems.length} validation problem(s) — repairing…` });
      const repair = await this.claude.execute({
        systemPromptFile: DEEPDIVE_PROMPT_PATH,
        userPrompt: [
          `Your previous output at ${filePath} has validation errors. Fix the file in place,`,
          `keeping the format rules exactly. Errors:`,
          ...problems.map((i) => `- ${i.code}: ${i.message}${i.line !== undefined ? ` (line ${i.line})` : ''}`),
        ].join('\n'),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress),
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }
  }

  /** Generate the implementation skill paired with one feature knowledge file. */
  async runFeatureSkill(entry: InventoryEntry, model: ClaudeModel, onProgress?: ProgressObserver): Promise<Result<void>> {
    const featureFile = `${ANALYSIS_FEATURES_DIR}/${entry.id}.md`;
    const skillFile = `${SKILLS_DIR}/${entry.id}.md`;
    const userPrompt = [
      `Create an implementation skill for the feature "${entry.name}" (id: ${entry.id}).`,
      `Read the feature knowledge file at exactly this path: ${featureFile}`,
      `Write the skill file to exactly this path: ${skillFile}`,
      `The skill must tell future agents to use the knowledge file first and avoid broad repo investigation.`,
    ].join('\n');

    const run = await this.claude.execute({
      systemPromptFile: FEATURE_SKILL_PROMPT_PATH,
      userPrompt,
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress),
    });
    if (!run.ok) return run;
    this.trackCall(run.value);

    for (let attempt = 0; ; attempt++) {
      const problems = await this.skillProblems(skillFile, featureFile);
      if (problems.length === 0) return ok(undefined);
      if (attempt >= MAX_REPAIRS) {
        return fail('ANALYSIS_FAILED', `${skillFile} is invalid after ${MAX_REPAIRS} repairs:\n${problems.join('\n')}`);
      }
      onProgress?.({ kind: 'warn', message: `${entry.id} skill has ${problems.length} validation problem(s) — repairing…` });
      const repair = await this.claude.execute({
        systemPromptFile: FEATURE_SKILL_PROMPT_PATH,
        userPrompt: [`Your previous output at ${skillFile} has validation errors. Fix the file in place.`, ...problems.map((p) => `- ${p}`)].join('\n'),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress),
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }
  }

  /** Combined pass — deep-dive + skill in one Claude call; writes features/<id>.md and skills/<id>.md. */
  async runCombinedFeature(entry: InventoryEntry, model: ClaudeModel, onProgress?: ProgressObserver): Promise<Result<void>> {
    const sha = await this.git.headSha();
    if (!sha.ok) return sha;

    const hasCodegraph = await this.fs.exists('.codegraph');

    const featureFile = `${ANALYSIS_FEATURES_DIR}/${entry.id}.md`;
    const skillFile = `${SKILLS_DIR}/${entry.id}.md`;
    const userPrompt = [
      `Deep-dive the feature "${entry.name}" (id: ${entry.id}) of this repository.`,
      `It belongs to area "${entry.area}". Its one-line summary from the inventory:`,
      `"${entry.summary}"`,
      ``,
      `Write the feature knowledge file to exactly: ${featureFile}`,
      `Write the implementation skill to exactly: ${skillFile}`,
      `Use this git sha for analyzedAt and every ref's sha field: ${sha.value}`,
      ``,
      `Feature ids that exist (for the related list): see ${INVENTORY_FILE}.`,
    ].join('\n');

    const run = await this.claude.execute({
      systemPromptFile: COMBINED_PROMPT_PATH,
      userPrompt,
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress),
      appendSystemPrompt: hasCodegraph ? CODEGRAPH_ADDENDUM : undefined,
    });
    if (!run.ok) return run;
    this.trackCall(run.value);

    for (let attempt = 0; ; attempt++) {
      const featureIssues = await this.featureProblems(featureFile, entry);
      const skillIssues = await this.skillProblems(skillFile, featureFile);
      if (featureIssues.length === 0 && skillIssues.length === 0) return ok(undefined);

      const allProblems = [
        ...featureIssues.map((i) => `${featureFile}: ${i.code}: ${i.message}${i.line !== undefined ? ` (line ${i.line})` : ''}`),
        ...skillIssues.map((p) => `${skillFile}: ${p}`),
      ];

      if (attempt >= MAX_REPAIRS) {
        return fail('ANALYSIS_FAILED', `${entry.id} is invalid after ${MAX_REPAIRS} repairs:\n${allProblems.map((p) => `- ${p}`).join('\n')}`);
      }
      onProgress?.({ kind: 'warn', message: `${entry.id} has ${allProblems.length} validation problem(s) — repairing…` });
      const repair = await this.claude.execute({
        systemPromptFile: COMBINED_PROMPT_PATH,
        userPrompt: [
          `Your previous output has validation errors. Fix BOTH files in place. Errors:`,
          ...allProblems.map((p) => `- ${p}`),
        ].join('\n'),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress),
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }
  }

  async readInventory(): Promise<Result<InventoryEntry[]>> {
    const raw = await this.fs.readText(INVENTORY_FILE);
    if (!raw.ok) return fail('ANALYSIS_FAILED', 'No inventory found — run `features init` first.');
    try {
      const parsed = InventorySchema.safeParse(JSON.parse(raw.value));
      if (!parsed.success) {
        return fail('ANALYSIS_FAILED', `_inventory.json does not match the schema: ${parsed.error.message}`);
      }
      return ok(parsed.data);
    } catch (e) {
      return fail('ANALYSIS_FAILED', `_inventory.json is not valid JSON: ${(e as Error).message}`, e);
    }
  }

  /** Get ref paths from an existing feature file (for cache invalidation). Returns empty if file is missing or invalid. */
  async featureRefPaths(featureId: string): Promise<readonly string[]> {
    const source = await this.fs.readText(`${ANALYSIS_FEATURES_DIR}/${featureId}.md`);
    if (!source.ok) return [];
    const result = parseFeature(source.value);
    if (!result.ok) return [];
    return result.doc.refs.map((r) => r.path);
  }

  /** Spec problems in the pass-1 outputs (empty array = valid). */
  private async inventoryProblems(): Promise<string[]> {
    const problems: string[] = [];

    const overviewSource = await this.fs.readText(OVERVIEW_FILE);
    let areaIds = new Set<string>();
    if (!overviewSource.ok) {
      problems.push(`${OVERVIEW_FILE} was not written`);
    } else {
      const overview = parseOverview(overviewSource.value);
      if (!overview.ok) {
        problems.push(...overview.issues.map((i) => `${OVERVIEW_FILE}: ${i.code}: ${i.message}`));
      } else {
        areaIds = new Set(overview.doc.areas.map((a) => a.id));
      }
    }

    const inventory = await this.readInventory();
    if (!inventory.ok) {
      problems.push(inventory.error.message);
    } else if (areaIds.size > 0) {
      const seen = new Set<string>();
      for (const entry of inventory.value) {
        if (!areaIds.has(entry.area)) {
          problems.push(`_inventory.json: feature "${entry.id}" references unknown area "${entry.area}"`);
        }
        if (seen.has(entry.id)) problems.push(`_inventory.json: duplicate feature id "${entry.id}"`);
        seen.add(entry.id);
      }
    }
    return problems;
  }

  private async skillProblems(skillFile: string, featureFile: string): Promise<string[]> {
    const problems: string[] = [];
    if (!(await this.fs.exists(featureFile))) problems.push(`${featureFile} was not written`);
    const source = await this.fs.readText(skillFile);
    if (!source.ok) return [`${skillFile} was not written`];
    if (!source.value.includes(featureFile)) problems.push(`skill must reference knowledge file ${featureFile}`);
    if (!/Do NOT (explore|scan|investigate)|avoid broad repo investigation/i.test(source.value)) {
      problems.push('skill must explicitly forbid broad repo investigation');
    }
    if (!/Knowledge Sync|update.*knowledge|update.*feature/i.test(source.value)) {
      problems.push('skill must include a final knowledge-sync/update step');
    }
    return problems;
  }

  /** Spec problems in a pass-2 output (empty array = valid). */
  private async featureProblems(filePath: string, entry: InventoryEntry): Promise<Issue[]> {
    const source = await this.fs.readText(filePath);
    if (!source.ok) return [{ code: 'missing-file', message: `${filePath} was not written` }];

    const result = parseFeature(source.value);
    if (!result.ok) return [...result.issues];

    const problems: Issue[] = [];
    if (result.doc.frontmatter.id !== entry.id) {
      problems.push({ code: 'id-mismatch', message: `frontmatter id must be "${entry.id}"` });
    }
    if (result.doc.frontmatter.area !== entry.area) {
      problems.push({ code: 'area-mismatch', message: `frontmatter area must be "${entry.area}"` });
    }
    // Refs must point at files that exist.
    for (const ref of result.doc.refs) {
      if (!(await this.fs.exists(ref.path))) {
        problems.push({ code: 'ref-file-missing', message: `ref path "${ref.path}" does not exist in the repo` });
      }
    }
    return problems;
  }
}
