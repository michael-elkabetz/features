import { z } from 'zod';
import { CodeRefSchema } from './ref.js';

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const FeatureStatusSchema = z.enum(['stable', 'beta', 'legacy']);
export type FeatureStatus = z.infer<typeof FeatureStatusSchema>;

export const FeatureComplexitySchema = z.enum(['simple', 'moderate', 'complex']);
export type FeatureComplexity = z.infer<typeof FeatureComplexitySchema>;

export const FeatureFrontmatterSchema = z.object({
  id: z.string().regex(SLUG_PATTERN, 'id must be a kebab-case slug'),
  area: z.string().regex(SLUG_PATTERN, 'area must be a kebab-case slug'),
  name: z.string().min(1),
  summary: z.string().min(1),
  status: FeatureStatusSchema,
  complexity: FeatureComplexitySchema,
  related: z.array(z.string().regex(SLUG_PATTERN)).default([]),
  specVersion: z.literal(1),
  /** Repo HEAD sha at analysis time; drives feature-level staleness. */
  analyzedAt: z
    .string()
    .regex(/^[0-9a-f]{6,40}$/i)
    .optional(),
});

export type FeatureFrontmatter = z.infer<typeof FeatureFrontmatterSchema>;

/** One step in the visual flow diagram: "Label — sub". */
export const FlowStepSchema = z.object({
  label: z.string().min(1),
  sub: z.string().optional(),
});
export type FlowStep = z.infer<typeof FlowStepSchema>;

/** A fully parsed feature knowledge file. */
export const FeatureDocSchema = z.object({
  frontmatter: FeatureFrontmatterSchema,
  nutshell: z.string().min(1),
  howItWorks: z.array(z.string().min(1)).min(1),
  flow: z.array(FlowStepSchema),
  refs: z.array(CodeRefSchema).min(1),
});

export type FeatureDoc = z.infer<typeof FeatureDocSchema>;

/** Canonical section headings; the parser keys off these exact strings. */
export const FEATURE_SECTIONS = {
  nutshell: 'In a nutshell',
  howItWorks: 'How it works',
  flow: 'Flow',
  refs: 'Code references',
  related: 'Related',
} as const;

export const REQUIRED_FEATURE_SECTIONS: readonly string[] = [
  FEATURE_SECTIONS.nutshell,
  FEATURE_SECTIONS.howItWorks,
  FEATURE_SECTIONS.refs,
];
