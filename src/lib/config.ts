import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Root of the features package (where package.json lives) */
export const PACKAGE_ROOT = join(__dirname, '..');

/** Path to the KB-CREATION.md prompt file */
export const KB_PROMPT_PATH = join(PACKAGE_ROOT, 'prompts', 'KB-CREATION.md');

/** Path to the SKILL-CREATION.md prompt file */
export const SKILL_CREATION_PROMPT_PATH = join(PACKAGE_ROOT, 'prompts', 'SKILL-CREATION.md');

/** Skill-creator GitHub repo URL */
export const SKILL_CREATOR_REPO = 'https://github.com/anthropics/skills.git';

/** Path within the repo to the skill-creator */
export const SKILL_CREATOR_SUBPATH = 'skills/skill-creator';

/** Where skill-creator gets installed (relative to target project) */
export const SKILL_CREATOR_INSTALL_DIR = '.claude/skills/skill-creator';

/** Default Claude model */
export const DEFAULT_MODEL = (process.env.FEATURES_MODEL || 'sonnet') as import('../types/config.js').ClaudeModel;
