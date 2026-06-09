import type { FeatureDoc } from '../schema/feature.js';
import type { OverviewDoc } from '../schema/overview.js';
import { type Issue, issue } from '../types.js';

/** Cross-document checks that individual parsers can't perform. */
export function validateProject(overview: OverviewDoc, features: readonly FeatureDoc[]): Issue[] {
  const issues: Issue[] = [];
  const areaIds = new Set(overview.areas.map((a) => a.id));
  const featureIds = new Set<string>();

  for (const feature of features) {
    const { id, area, related } = feature.frontmatter;
    if (featureIds.has(id)) {
      issues.push(issue('duplicate-feature', `Feature id "${id}" is defined more than once`));
    }
    featureIds.add(id);
    if (!areaIds.has(area)) {
      issues.push(issue('unknown-area', `Feature "${id}" references area "${area}" which is not defined in overview.md`));
    }
    for (const rel of related) {
      if (rel === id) {
        issues.push(issue('self-related', `Feature "${id}" lists itself in related`));
      }
    }
  }

  // Related ids must exist (checked after collecting all ids).
  for (const feature of features) {
    for (const rel of feature.frontmatter.related) {
      if (rel !== feature.frontmatter.id && !featureIds.has(rel)) {
        issues.push(
          issue('unknown-related', `Feature "${feature.frontmatter.id}" relates to "${rel}" which does not exist`),
        );
      }
    }
  }

  // Areas with no features are suspicious but not fatal — surfaced as a distinct code.
  const usedAreas = new Set(features.map((f) => f.frontmatter.area));
  for (const area of overview.areas) {
    if (!usedAreas.has(area.id)) {
      issues.push(issue('empty-area', `Area "${area.id}" has no features`));
    }
  }

  return issues;
}

/** Issue codes that should not fail a build (informational). */
export const WARNING_CODES: ReadonlySet<string> = new Set(['empty-area']);

export function splitIssues(issues: readonly Issue[]): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  for (const i of issues) (WARNING_CODES.has(i.code) ? warnings : errors).push(i);
  return { errors, warnings };
}
