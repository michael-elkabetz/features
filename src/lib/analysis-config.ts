import { join } from 'node:path';
import { PACKAGE_ROOT } from './config.js';

export const ANALYSIS_DIR = '.features';
export const ANALYSIS_FEATURES_DIR = join(ANALYSIS_DIR, 'features');
export const SKILLS_DIR = join(ANALYSIS_DIR, 'skills');
export const OVERVIEW_FILE = join(ANALYSIS_DIR, 'overview.md');
export const INVENTORY_FILE = join(ANALYSIS_FEATURES_DIR, '_inventory.json');
export const MANIFEST_FILE = join(ANALYSIS_DIR, 'manifest.json');

export const DEFAULT_SERVE_PORT = 4747;

const PROMPTS_DIR = join(PACKAGE_ROOT, 'prompts');
export const INVENTORY_PROMPT_PATH = join(PROMPTS_DIR, 'INVENTORY.md');
export const DEEPDIVE_PROMPT_PATH = join(PROMPTS_DIR, 'FEATURE-DEEPDIVE.md');
export const FEATURE_SKILL_PROMPT_PATH = join(PROMPTS_DIR, 'FEATURE-SKILL.md');
export const COMBINED_PROMPT_PATH = join(PROMPTS_DIR, 'FEATURE-COMBINED.md');
export const VIEWER_DIST_DIR = join(PACKAGE_ROOT, 'viewer-dist');

export const DEFAULT_IGNORE_DIRS: readonly string[] = [
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.git',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.gradle',
  'Pods',
  'coverage',
  '.idea',
  '.vscode',
  '.features',
];
