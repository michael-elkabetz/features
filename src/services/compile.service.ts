import {
  type FeatureDoc,
  type Manifest,
  type ManifestFeature,
  type ManifestRef,
  ManifestSchema,
  SPEC_VERSION,
  splitIssues,
} from '../spec/index.js';
import { extractSnippet, langTagFor, verifyRef } from '../verify/index.js';
import type { GitClient } from '../clients/git.client.js';
import { ANALYSIS_DIR, MANIFEST_FILE } from '../lib/analysis-config.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import type { Result } from '../types/index.js';
import { fail, ok } from '../types/index.js';
import type { FileIssues, ValidateService } from './validate.service.js';

export interface CompileSummary {
  readonly features: number;
  readonly refs: number;
  readonly verified: number;
  readonly healed: number;
  readonly unverified: number;
  readonly stale: number;
  readonly staleFeatures: readonly string[];
  readonly warnings: readonly FileIssues[];
  readonly manifestPath: string;
}

export class CompileService {
  constructor(
    private readonly fs: FilesystemRepository,
    private readonly git: GitClient,
    private readonly validateService: ValidateService,
  ) {}

  /**
   * md → manifest.json. Pure Node (no AI): parse + validate, verify/heal every code
   * reference against the live repo, extract snippets, compute staleness and stats.
   */
  async compile(): Promise<Result<CompileSummary, FileIssues[] | string>> {
    const project = await this.validateService.validateAll();
    if (!project.ok) return project as Result<never, FileIssues[]>;

    const { overview, features, projectIssues } = project.value;
    const { errors, warnings } = splitIssues(projectIssues);
    if (errors.length > 0) {
      return { ok: false, error: [{ file: `${ANALYSIS_DIR}/`, issues: errors }] };
    }

    // Feature-level staleness: files changed since each feature's analyzedAt sha.
    const changedSince = new Map<string, Set<string>>();
    for (const doc of features.values()) {
      const sha = doc.frontmatter.analyzedAt;
      if (sha && !changedSince.has(sha)) {
        const changed = await this.git.changedFilesSince(sha);
        changedSince.set(sha, new Set(changed.ok ? changed.value : []));
      }
    }

    const counters = { refs: 0, verified: 0, healed: 0, unverified: 0, stale: 0 };
    const staleFeatures: string[] = [];
    const manifestFeatures: ManifestFeature[] = [];

    for (const doc of features.values()) {
      const refs: ManifestRef[] = [];
      for (const ref of doc.refs) {
        refs.push(await this.compileRef(ref, counters));
      }

      const changed = doc.frontmatter.analyzedAt ? changedSince.get(doc.frontmatter.analyzedAt) : undefined;
      const featureStale =
        (changed !== undefined && doc.refs.some((r) => changed.has(r.path))) || refs.some((r) => r.stale);
      if (featureStale) staleFeatures.push(doc.frontmatter.id);

      manifestFeatures.push({
        id: doc.frontmatter.id,
        area: doc.frontmatter.area,
        name: doc.frontmatter.name,
        summary: doc.frontmatter.summary,
        status: doc.frontmatter.status,
        complexity: doc.frontmatter.complexity,
        nutshell: doc.nutshell,
        howItWorks: doc.howItWorks,
        flow: doc.flow,
        files: refs,
        related: doc.frontmatter.related,
        featureStale,
      });
    }

    const fileCount = (await this.git.trackedFileCount()) ?? 0;
    const manifest: Manifest = {
      specVersion: SPEC_VERSION,
      repo: {
        name: overview.frontmatter.name,
        tagline: overview.frontmatter.tagline,
        description: overview.description,
        language: overview.frontmatter.language,
        stats: {
          files: fileCount,
          features: manifestFeatures.length,
          areas: overview.areas.length,
          lastAnalyzed: new Date().toISOString(),
        },
      },
      areas: overview.areas,
      features: manifestFeatures,
    };

    const parsed = ManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      return fail2(`Internal error: compiled manifest failed schema validation: ${parsed.error.message}`);
    }

    const writeResult = await this.fs.writeText(MANIFEST_FILE, JSON.stringify(parsed.data, null, 2));
    if (!writeResult.ok) return fail2(writeResult.error.message);

    return ok({
      features: manifestFeatures.length,
      ...counters,
      staleFeatures,
      warnings: warnings.length > 0 ? [{ file: `${ANALYSIS_DIR}/`, issues: warnings }] : [],
      manifestPath: this.fs.resolve(MANIFEST_FILE),
    });
  }

  private async compileRef(
    ref: FeatureDoc['refs'][number],
    counters: { refs: number; verified: number; healed: number; unverified: number; stale: number },
  ): Promise<ManifestRef> {
    counters.refs++;
    const lang = langTagFor(ref.path);
    const base = { path: ref.path, lang, what: ref.what, annotation: ref.note, symbol: ref.symbol };

    const source = await this.fs.readText(ref.path);
    if (!source.ok) {
      counters.stale++;
      return {
        ...base,
        lines: ref.lines,
        code: '',
        provenance: 'stale',
        verifiedBy: 'none',
        healed: false,
        stale: true,
        staleReason: 'file-missing',
      };
    }

    const outcome = await verifyRef(source.value, ref);
    counters[
      outcome.provenance === 'verified'
        ? 'verified'
        : outcome.provenance === 'healed'
          ? 'healed'
          : outcome.provenance === 'stale'
            ? 'stale'
            : 'unverified'
    ]++;

    return {
      ...base,
      lines: outcome.lines,
      code: extractSnippet(source.value, outcome.lines),
      provenance: outcome.provenance,
      verifiedBy: outcome.verifiedBy,
      healed: outcome.healed,
      stale: outcome.stale,
      staleReason: outcome.staleReason,
    };
  }
}

function fail2(message: string): Result<never, string> {
  return { ok: false, error: message };
}
