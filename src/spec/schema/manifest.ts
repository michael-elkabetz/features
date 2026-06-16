import { z } from 'zod';
import { AreaSchema } from './overview.js';
import { FeatureComplexitySchema, FeatureKindSchema, FeatureStatusSchema, FlowStepSchema, SLUG_PATTERN } from './feature.js';
import { LineRangeSchema } from './ref.js';

/** How a manifest ref was confirmed against the live repo. */
export const RefProvenanceSchema = z.enum(['verified', 'healed', 'unverified', 'stale']);
export type RefProvenance = z.infer<typeof RefProvenanceSchema>;

export const StaleReasonSchema = z.enum(['symbol-not-found', 'file-missing', 'lines-out-of-range']);
export type StaleReason = z.infer<typeof StaleReasonSchema>;

/** A code reference in the compiled manifest, snippet included. */
export const ManifestRefSchema = z.object({
  path: z.string().min(1),
  /** Language tag for syntax highlighting, inferred from the extension. */
  lang: z.string(),
  what: z.string(),
  annotation: z.string().optional(),
  /** The range the snippet was extracted from (post-healing). */
  lines: LineRangeSchema,
  symbol: z.string().optional(),
  /** Extracted at compile time from the live repo — never authored. */
  code: z.string(),
  provenance: RefProvenanceSchema,
  verifiedBy: z.enum(['tree-sitter', 'grep', 'none']),
  /** True when the authored range drifted and was auto-corrected via symbol resolution. */
  healed: z.boolean(),
  stale: z.boolean(),
  staleReason: StaleReasonSchema.optional(),
});

export type ManifestRef = z.infer<typeof ManifestRefSchema>;

export const ManifestFeatureSchema = z.object({
  id: z.string().regex(SLUG_PATTERN),
  area: z.string().regex(SLUG_PATTERN),
  name: z.string().min(1),
  summary: z.string().min(1),
  kind: FeatureKindSchema,
  status: FeatureStatusSchema,
  complexity: FeatureComplexitySchema,
  nutshell: z.string().min(1),
  howItWorks: z.array(z.string()),
  flow: z.array(FlowStepSchema),
  files: z.array(ManifestRefSchema),
  related: z.array(z.string()),
  /** True when files this feature references changed since it was analyzed. */
  featureStale: z.boolean(),
  /** Markdown content of the feature's SKILL.md, if present. */
  skill: z.string().optional(),
});

export type ManifestFeature = z.infer<typeof ManifestFeatureSchema>;

export const ManifestStatsSchema = z.object({
  files: z.number().int().nonnegative(),
  features: z.number().int().nonnegative(),
  areas: z.number().int().nonnegative(),
  /** ISO timestamp of the compile. */
  lastAnalyzed: z.string(),
});

export const ManifestSchema = z.object({
  specVersion: z.literal(1),
  repo: z.object({
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    language: z.string(),
    stats: ManifestStatsSchema,
  }),
  areas: z.array(AreaSchema),
  features: z.array(ManifestFeatureSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
