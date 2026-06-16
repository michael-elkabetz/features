export { SPEC_VERSION } from './version.js';
export { type Issue, type ParseResult, failed, issue, parsed } from './types.js';

export {
  CodeRefSchema,
  LineRangeSchema,
  parseLineRange,
  parseRefBlock,
  type CodeRef,
  type LineRange,
} from './schema/ref.js';

export {
  FEATURE_SECTIONS,
  REQUIRED_FEATURE_SECTIONS,
  FeatureComplexitySchema,
  FeatureKindSchema,
  FeatureDocSchema,
  FeatureFrontmatterSchema,
  FeatureStatusSchema,
  FlowStepSchema,
  SLUG_PATTERN,
  type FeatureComplexity,
  type FeatureKind,
  type FeatureDoc,
  type FeatureFrontmatter,
  type FeatureStatus,
  type FlowStep,
} from './schema/feature.js';

export {
  AreaSchema,
  OVERVIEW_SECTIONS,
  OverviewDocSchema,
  OverviewFrontmatterSchema,
  type Area,
  type OverviewDoc,
  type OverviewFrontmatter,
} from './schema/overview.js';

export {
  ManifestFeatureSchema,
  ManifestRefSchema,
  ManifestSchema,
  ManifestStatsSchema,
  RefProvenanceSchema,
  StaleReasonSchema,
  type Manifest,
  type ManifestFeature,
  type ManifestRef,
  type RefProvenance,
  type StaleReason,
} from './schema/manifest.js';

export { parseFeature, parseFlowStep } from './parse/feature-parser.js';
export { parseOverview } from './parse/overview-parser.js';
export { parseFrontmatter } from './parse/frontmatter.js';

export { WARNING_CODES, splitIssues, validateProject } from './validate/validate.js';
