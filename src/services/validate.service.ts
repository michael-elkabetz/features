import {
  type FeatureDoc,
  type Issue,
  type OverviewDoc,
  issue,
  parseFeature,
  parseOverview,
  validateProject,
} from '../spec/index.js';
import { ANALYSIS_FEATURES_DIR, OVERVIEW_FILE } from '../lib/analysis-config.js';
import type { FilesystemRepository } from '../repositories/filesystem.repository.js';
import type { Result } from '../types/index.js';
import { fail, ok } from '../types/index.js';

export interface FileIssues {
  readonly file: string;
  readonly issues: readonly Issue[];
}

export interface ValidatedProject {
  readonly overview: OverviewDoc;
  /** Parsed feature docs keyed by source file path (repo-relative). */
  readonly features: ReadonlyMap<string, FeatureDoc>;
  /** Cross-document issues (may include warnings). */
  readonly projectIssues: readonly Issue[];
}

export class ValidateService {
  constructor(private readonly fs: FilesystemRepository) {}

  /** List feature md files (repo-relative paths), excluding underscore-prefixed artifacts. */
  async listFeatureFiles(): Promise<Result<string[]>> {
    const entries = await this.fs.listDir(ANALYSIS_FEATURES_DIR);
    if (!entries.ok) return entries;
    return ok(
      entries.value
        .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
        .sort()
        .map((name) => `${ANALYSIS_FEATURES_DIR}/${name}`),
    );
  }

  /**
   * Parse and validate the whole .code-explain/ directory.
   * Returns the parsed project, or every issue found (grouped by file).
   */
  async validateAll(): Promise<Result<ValidatedProject, FileIssues[]>> {
    const allIssues: FileIssues[] = [];

    if (!(await this.fs.exists(OVERVIEW_FILE))) {
      return fail2([{ file: OVERVIEW_FILE, issues: [issue('not-initialized', 'overview.md not found — run `features init` first')] }]);
    }

    const overviewSource = await this.fs.readText(OVERVIEW_FILE);
    if (!overviewSource.ok) {
      return fail2([{ file: OVERVIEW_FILE, issues: [issue('read-error', overviewSource.error.message)] }]);
    }
    const overviewResult = parseOverview(overviewSource.value);
    if (!overviewResult.ok) {
      allIssues.push({ file: OVERVIEW_FILE, issues: overviewResult.issues });
    }

    const fileList = await this.listFeatureFiles();
    const features = new Map<string, FeatureDoc>();
    if (fileList.ok) {
      for (const file of fileList.value) {
        const source = await this.fs.readText(file);
        if (!source.ok) {
          allIssues.push({ file, issues: [issue('read-error', source.error.message)] });
          continue;
        }
        const result = parseFeature(source.value);
        if (!result.ok) {
          allIssues.push({ file, issues: result.issues });
          continue;
        }
        // id must match filename
        const expectedId = file.split('/').pop()!.replace(/\.md$/, '');
        if (result.doc.frontmatter.id !== expectedId) {
          allIssues.push({
            file,
            issues: [issue('id-mismatch', `Frontmatter id "${result.doc.frontmatter.id}" must equal filename "${expectedId}"`)],
          });
          continue;
        }
        features.set(file, result.doc);
      }
    }

    if (!overviewResult.ok || allIssues.length > 0) {
      return fail2(allIssues);
    }

    const projectIssues = validateProject(overviewResult.doc, [...features.values()]);
    return ok({ overview: overviewResult.doc, features, projectIssues });
  }
}

function fail2(issues: FileIssues[]): Result<never, FileIssues[]> {
  return { ok: false, error: issues };
}
