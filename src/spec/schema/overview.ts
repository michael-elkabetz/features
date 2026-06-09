import { z } from 'zod';
import { SLUG_PATTERN } from './feature.js';

export const OverviewFrontmatterSchema = z.object({
  /** Display name, e.g. "acme/maple". */
  name: z.string().min(1),
  tagline: z.string().min(1),
  /** e.g. "TypeScript + React". */
  language: z.string().min(1),
  specVersion: z.literal(1),
  analyzedAt: z
    .string()
    .regex(/^[0-9a-f]{6,40}$/i)
    .optional(),
});

export type OverviewFrontmatter = z.infer<typeof OverviewFrontmatterSchema>;

/** An ```area fenced block inside overview.md. */
export const AreaSchema = z.object({
  id: z.string().regex(SLUG_PATTERN, 'area id must be a kebab-case slug'),
  name: z.string().min(1),
  /** Icon name the viewer maps to an SVG (e.g. "chat", "hash", "shield"). */
  icon: z.string().min(1),
  blurb: z.string().min(1),
});

export type Area = z.infer<typeof AreaSchema>;

export const OverviewDocSchema = z.object({
  frontmatter: OverviewFrontmatterSchema,
  description: z.string().min(1),
  areas: z.array(AreaSchema).min(1),
});

export type OverviewDoc = z.infer<typeof OverviewDocSchema>;

export const OVERVIEW_SECTIONS = {
  description: 'Description',
  areas: 'Areas',
} as const;
