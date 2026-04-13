#!/usr/bin/env node

// src/index.ts
import { program } from "commander";

// src/version.ts
var VERSION = "0.1.0";

// src/repositories/filesystem.repository.ts
import { readFile, writeFile, access, mkdir, cp, readdir, stat, copyFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";

// src/types/results.ts
function ok(value) {
  return { ok: true, value };
}
function fail(code, message, cause) {
  return { ok: false, error: { code, message, cause } };
}

// src/types/features.ts
function toFeatureName(raw) {
  const normalized = raw.startsWith("features-") ? raw : `features-${raw}`;
  return normalized;
}
function stripFeaturePrefix(name) {
  return name.replace(/^features-/, "");
}

// src/types/claude.ts
function isClaudeStreamEvent(value) {
  if (typeof value !== "object" || value === null) return false;
  const obj = value;
  return obj.type === "assistant" || obj.type === "result";
}

// src/types/config.ts
var CLAUDE_MODELS = ["sonnet", "opus", "haiku"];
function isClaudeModel(value) {
  return CLAUDE_MODELS.includes(value);
}
function resolveModel(raw, fallback) {
  if (!raw) return fallback;
  if (isClaudeModel(raw)) return raw;
  return raw;
}

// src/repositories/filesystem.repository.ts
var FilesystemRepository = class {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }
  rootDir;
  get root() {
    return this.rootDir;
  }
  resolve(...segments) {
    return resolve(this.rootDir, ...segments);
  }
  async readText(path) {
    try {
      const content = await readFile(this.resolve(path), "utf-8");
      return ok(content);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to read ${path}`, err);
    }
  }
  async writeText(path, content) {
    try {
      await writeFile(this.resolve(path), content, "utf-8");
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to write ${path}`, err);
    }
  }
  async exists(path) {
    try {
      await access(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }
  existsSync(path) {
    return existsSync(this.resolve(path));
  }
  async ensureDir(path) {
    try {
      await mkdir(this.resolve(path), { recursive: true });
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to create directory ${path}`, err);
    }
  }
  async copy(src, dest, options) {
    try {
      await cp(this.resolve(src), this.resolve(dest), { recursive: options?.recursive ?? true });
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to copy ${src} to ${dest}`, err);
    }
  }
  async copyFile(src, dest) {
    try {
      await copyFile(this.resolve(src), this.resolve(dest));
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to copy file ${src} to ${dest}`, err);
    }
  }
  async copyAbsolute(absSrc, absDest) {
    try {
      await cp(absSrc, absDest, { recursive: true });
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to copy ${absSrc} to ${absDest}`, err);
    }
  }
  async copyFileAbsolute(absSrc, absDest) {
    try {
      await copyFile(absSrc, absDest);
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to copy file to ${absDest}`, err);
    }
  }
  async listDir(path) {
    try {
      const entries = await readdir(this.resolve(path));
      return ok(entries);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to list directory ${path}`, err);
    }
  }
  async isDirectory(path) {
    try {
      const s = await stat(this.resolve(path));
      return s.isDirectory();
    } catch {
      return false;
    }
  }
  async remove(path) {
    try {
      await rm(this.resolve(path), { recursive: true, force: true });
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to remove ${path}`, err);
    }
  }
  async removeAbsolute(absPath) {
    try {
      await rm(absPath, { recursive: true, force: true });
      return ok(void 0);
    } catch (err) {
      return fail("FILESYSTEM_ERROR", `Failed to remove ${absPath}`, err);
    }
  }
};

// src/repositories/feature.repository.ts
import { join } from "path";
var FeatureRepository = class {
  constructor(fs2) {
    this.fs = fs2;
  }
  fs;
  async findAll() {
    const listResult = await this.fs.listDir(".features");
    if (!listResult.ok) {
      return ok([]);
    }
    const features = [];
    for (const entry of listResult.value) {
      if (!entry.startsWith("features-")) continue;
      const kbPath = join(".features", entry, "kb", "KNOWLEDGE.md");
      const legacyKbPath = join(".features", entry, "kb", "knowledge.md");
      const legacyKbPath2 = join(".features", entry, "knowledge", "knowledge.md");
      const skillPath = join(".features", entry, "skill", "SKILL.md");
      const kbExists = await this.fs.exists(kbPath);
      const legacyKbExists = !kbExists && await this.fs.exists(legacyKbPath);
      const legacyKb2Exists = !kbExists && !legacyKbExists && await this.fs.exists(legacyKbPath2);
      if (!kbExists && !legacyKbExists && !legacyKb2Exists) continue;
      const resolvedKbPath = kbExists ? kbPath : legacyKbExists ? legacyKbPath : legacyKbPath2;
      const hasSkill = await this.fs.exists(skillPath);
      features.push({
        name: toFeatureName(entry),
        kbPath: resolvedKbPath,
        skillPath,
        hasSkill
      });
    }
    return ok(features.sort((a, b) => a.name.localeCompare(b.name)));
  }
  async findByName(name) {
    const featuresResult = await this.findAll();
    if (!featuresResult.ok) return featuresResult;
    const found = featuresResult.value.find((f) => f.name === name);
    if (!found) {
      return fail("FEATURE_NOT_FOUND", `Feature "${name}" not found`);
    }
    return ok(found);
  }
  async readKB(feature) {
    return this.fs.readText(feature.kbPath);
  }
};

// src/clients/claude.client.ts
import { spawn } from "child_process";
import { writeFile as writeFile2, unlink } from "fs/promises";
import { join as join2 } from "path";
import { tmpdir } from "os";
import { createInterface } from "readline";
import ora from "ora";
var ClaudeClient = class {
  async execute(options) {
    const {
      systemPrompt,
      systemPromptFile,
      appendSystemPrompt,
      appendSystemPromptFile,
      userPrompt,
      model,
      print
    } = options;
    const tmpFiles = [];
    const args = [];
    if (print) {
      args.push("-p", "--verbose", "--output-format", "stream-json");
    }
    if (systemPromptFile) {
      args.push("--system-prompt-file", systemPromptFile);
    } else if (systemPrompt) {
      const tmpFile = join2(tmpdir(), `features-sys-${Date.now()}.md`);
      await writeFile2(tmpFile, systemPrompt, "utf-8");
      tmpFiles.push(tmpFile);
      args.push("--system-prompt-file", tmpFile);
    }
    if (appendSystemPromptFile) {
      args.push("--append-system-prompt-file", appendSystemPromptFile);
    } else if (appendSystemPrompt) {
      const tmpFile = join2(tmpdir(), `features-append-${Date.now()}.md`);
      await writeFile2(tmpFile, appendSystemPrompt, "utf-8");
      tmpFiles.push(tmpFile);
      args.push("--append-system-prompt-file", tmpFile);
    }
    if (model) {
      args.push("--model", model);
    }
    args.push(userPrompt);
    const cleanup = () => {
      for (const f of tmpFiles) {
        unlink(f).catch(() => {
        });
      }
    };
    return new Promise((resolve2) => {
      const child = spawn("claude", args, {
        stdio: print ? ["ignore", "pipe", "inherit"] : "inherit"
      });
      let activeSpinner = null;
      if (print && child.stdout) {
        const rl = createInterface({ input: child.stdout });
        rl.on("line", (line) => {
          try {
            const parsed = JSON.parse(line);
            if (isClaudeStreamEvent(parsed)) {
              activeSpinner = handleStreamEvent(parsed, activeSpinner);
            }
          } catch {
          }
        });
      }
      child.on("error", (err) => {
        cleanup();
        if (err.code === "ENOENT") {
          resolve2(fail(
            "CLAUDE_NOT_FOUND",
            "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code"
          ));
        } else {
          resolve2(fail("CLAUDE_FAILED", `Claude process error: ${err.message}`, err));
        }
      });
      child.on("close", (code) => {
        cleanup();
        stopSpinner(activeSpinner);
        resolve2(ok({ exitCode: code ?? 0 }));
      });
    });
  }
};
function stopSpinner(spinner2) {
  if (spinner2?.isSpinning) {
    spinner2.stop();
  }
}
function toolLabel(block) {
  const name = block.name || "";
  const input = block.input || {};
  if (name === "Write" && input.file_path) return `Writing ${input.file_path}`;
  if (name === "Read" && input.file_path) return `Reading ${input.file_path}`;
  if (name === "Glob") return `Searching ${input.pattern || ""}`;
  if (name === "Grep") return `Grep: ${input.pattern || ""}`;
  if (name === "Bash") return input.command || "Running command";
  if (name === "Agent") return input.description || name;
  if (name) return name;
  return null;
}
function handleStreamEvent(event, activeSpinner) {
  if (event.type === "assistant" && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        stopSpinner(activeSpinner);
        activeSpinner = null;
        process.stdout.write(`  ${block.text}
`);
      }
      if (block.type === "tool_use") {
        const label = toolLabel(block);
        if (label) {
          if (activeSpinner?.isSpinning) {
            activeSpinner.text = label;
          } else {
            stopSpinner(activeSpinner);
            activeSpinner = ora({ text: label, indent: 2 }).start();
          }
        }
      }
    }
  }
  if (event.type === "result") {
    stopSpinner(activeSpinner);
    activeSpinner = null;
    if (event.is_error) {
      process.stdout.write(`  Error: ${event.result || "Unknown error"}
`);
    } else {
      const duration = event.duration_ms ? `${Math.round(event.duration_ms / 1e3)}s` : "";
      const turns = event.num_turns ? `${event.num_turns} turns` : "";
      const info = [turns, duration].filter(Boolean).join(", ");
      process.stdout.write(`  Done${info ? ` (${info})` : ""}
`);
    }
  }
  return activeSpinner;
}

// src/clients/git.client.ts
import { exec as execCb } from "child_process";
import { promisify } from "util";
var exec = promisify(execCb);
var GitClient = class {
  async sparseClone(repo, subpath, dest) {
    try {
      await exec(`git clone --depth 1 --filter=blob:none --sparse "${repo}" "${dest}"`);
      await exec(`git -C "${dest}" sparse-checkout set "${subpath}"`);
      return ok(void 0);
    } catch (err) {
      return fail("GIT_FAILED", `Sparse clone failed for ${repo}`, err);
    }
  }
  async shallowClone(repo, dest) {
    try {
      await exec(`git clone --depth 1 "${repo}" "${dest}"`);
      return ok(void 0);
    } catch (err) {
      return fail("GIT_FAILED", `Shallow clone failed for ${repo}`, err);
    }
  }
};

// src/clients/editor.client.ts
import { spawn as spawn2 } from "child_process";
var EditorClient = class {
  open(filePath) {
    const editor = process.env.VISUAL || process.env.EDITOR || "vi";
    return new Promise((resolve2) => {
      const child = spawn2(editor, [filePath], {
        stdio: "inherit"
      });
      child.on("error", (err) => {
        resolve2(fail("EDITOR_FAILED", `Failed to open editor (${editor}): ${err.message}`, err));
      });
      child.on("close", () => {
        resolve2(ok(void 0));
      });
    });
  }
};

// src/services/feature.service.ts
var FeatureService = class {
  constructor(featureRepo2, claudeClient2) {
    this.featureRepo = featureRepo2;
    this.claudeClient = claudeClient2;
  }
  featureRepo;
  claudeClient;
  async listFeatures() {
    return this.featureRepo.findAll();
  }
  async executeFeature(feature, task, model) {
    const kbResult = await this.featureRepo.readKB(feature);
    if (!kbResult.ok) return kbResult;
    const appendPrompt = [
      "# Feature KB \u2014 MANDATORY CONTEXT",
      "",
      "CRITICAL RULES:",
      "- You ALREADY have all the knowledge you need below. Do NOT explore, scan, or investigate the codebase to understand it.",
      "- Do NOT use Glob, Grep, or subagents to discover patterns or architecture \u2014 that work has already been done for you.",
      "- ONLY read specific files when you need to edit them.",
      "- Follow the patterns and conventions described in the knowledge below exactly.",
      "",
      "---",
      "",
      kbResult.value
    ].join("\n");
    const userPrompt = feature.hasSkill ? `/${feature.name} ${task}` : task;
    const result = await this.claudeClient.execute({
      appendSystemPrompt: appendPrompt,
      userPrompt,
      model
    });
    if (!result.ok) return result;
    return ok(void 0);
  }
};

// src/services/kb.service.ts
import { join as join4 } from "path";

// src/lib/config.ts
import { fileURLToPath } from "url";
import { dirname, join as join3 } from "path";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var PACKAGE_ROOT = join3(__dirname, "..");
var KB_PROMPT_PATH = join3(PACKAGE_ROOT, "prompts", "KB-CREATION.md");
var SKILL_CREATION_PROMPT_PATH = join3(PACKAGE_ROOT, "prompts", "SKILL-CREATION.md");
var SKILL_CREATOR_REPO = "https://github.com/anthropics/skills.git";
var SKILL_CREATOR_SUBPATH = "skills/skill-creator";
var SKILL_CREATOR_INSTALL_DIR = ".claude/skills/skill-creator";
var DEFAULT_MODEL = process.env.FEATURES_MODEL || "sonnet";

// src/services/kb.service.ts
var KBService = class {
  constructor(fs2, claudeClient2) {
    this.fs = fs2;
    this.claudeClient = claudeClient2;
  }
  fs;
  claudeClient;
  async createKB(featureName, topic, model) {
    const kbDir = join4(".features", featureName, "kb");
    const ensureResult = await this.fs.ensureDir(kbDir);
    if (!ensureResult.ok) return ensureResult;
    const kbFilePath = join4(".features", featureName, "kb", "KNOWLEDGE.md");
    const userMessage = `Create a knowledge file for: ${topic}

Write the output to: ${kbFilePath}`;
    const claudeResult = await this.claudeClient.execute({
      systemPromptFile: KB_PROMPT_PATH,
      userPrompt: userMessage,
      model,
      print: true
    });
    if (!claudeResult.ok) return claudeResult;
    if (claudeResult.value.exitCode !== 0) {
      return fail("CLAUDE_FAILED", `Claude exited with code ${claudeResult.value.exitCode}`);
    }
    const kbExists = await this.fs.exists(kbFilePath);
    if (!kbExists) {
      return fail("KB_NOT_FOUND", "KB was not created by Claude");
    }
    return ok(kbFilePath);
  }
  async updateKB(feature, model) {
    const userPrompt = buildKBUpdatePrompt(feature.kbPath);
    const result = await this.claudeClient.execute({
      userPrompt,
      model,
      print: true
    });
    if (!result.ok) return result;
    if (result.value.exitCode !== 0) {
      return fail("CLAUDE_FAILED", `Claude exited with code ${result.value.exitCode}`);
    }
    return ok(void 0);
  }
};
function buildKBUpdatePrompt(kbPath) {
  return [
    `Investigate the current state of the codebase and update the KB at ${kbPath}.`,
    "",
    "Instructions:",
    `1. Read the existing KB at ${kbPath} to understand what it currently covers.`,
    "2. Scan the codebase \u2014 use Glob, Grep, and Read to discover what has changed since the KB was written.",
    "3. Compare the current code against what the KB describes.",
    "4. Update the KB in place:",
    "   - Fix any sections that no longer reflect reality",
    "   - Add new patterns, conventions, or architecture that emerged since the last update",
    "   - Remove or correct stale information",
    "   - Keep the same YAML frontmatter format (description, category)",
    "   - Update the description keywords if the scope changed",
    "5. Keep the file under 500 lines.",
    "6. Do NOT rewrite from scratch \u2014 revise existing sections so the file reads as a coherent, up-to-date document."
  ].join("\n");
}

// src/services/skill.service.ts
import { join as join5 } from "path";
import { tmpdir as tmpdir2 } from "os";
var SkillService = class {
  constructor(fs2, claudeClient2, gitClient2) {
    this.fs = fs2;
    this.claudeClient = claudeClient2;
    this.gitClient = gitClient2;
  }
  fs;
  claudeClient;
  gitClient;
  async ensureSkillCreator() {
    const installPath = join5(SKILL_CREATOR_INSTALL_DIR, "SKILL.md");
    if (this.fs.existsSync(installPath)) {
      return ok(void 0);
    }
    const installDir = this.fs.resolve(SKILL_CREATOR_INSTALL_DIR);
    const tmpDir = join5(tmpdir2(), `features-skill-creator-${Date.now()}`);
    try {
      const sparseResult = await this.gitClient.sparseClone(SKILL_CREATOR_REPO, SKILL_CREATOR_SUBPATH, tmpDir);
      if (!sparseResult.ok) {
        await this.fs.removeAbsolute(tmpDir);
        const shallowResult = await this.gitClient.shallowClone(SKILL_CREATOR_REPO, tmpDir);
        if (!shallowResult.ok) return shallowResult;
      }
      const srcDir = join5(tmpDir, SKILL_CREATOR_SUBPATH);
      const ensureResult = await this.fs.ensureDir(SKILL_CREATOR_INSTALL_DIR);
      if (!ensureResult.ok) return ensureResult;
      const copyResult = await this.fs.copyAbsolute(srcDir, installDir);
      if (!copyResult.ok) return copyResult;
      return ok(void 0);
    } finally {
      await this.fs.removeAbsolute(tmpDir);
    }
  }
  async createSkill(options) {
    const { featureName, topic, kbPath, model } = options;
    const installResult = await this.ensureSkillCreator();
    if (!installResult.ok) return installResult;
    const skillDir = join5(".features", featureName, "skill");
    const ensureResult = await this.fs.ensureDir(skillDir);
    if (!ensureResult.ok) return ensureResult;
    const userMessage = [
      `/skill-creator Create a skill for "${topic}" based on the knowledge file at ${kbPath}.`,
      "",
      `Place ALL output (SKILL.md, scripts/, agents/, references/, everything) inside ${skillDir}/`,
      "",
      `The knowledge file path for the Knowledge Sync feedback loop is: ${kbPath}`,
      "",
      "Do not ask me questions \u2014 read the knowledge file and create the skill."
    ].join("\n");
    const result = await this.claudeClient.execute({
      appendSystemPromptFile: SKILL_CREATION_PROMPT_PATH,
      userPrompt: userMessage,
      model,
      print: true
    });
    if (!result.ok) return result;
    return ok(result.value.exitCode);
  }
  async updateSkill(feature, model) {
    const userPrompt = buildSkillUpdatePrompt(feature.skillPath, feature.kbPath);
    const result = await this.claudeClient.execute({
      userPrompt,
      model,
      print: true
    });
    if (!result.ok) return result;
    if (result.value.exitCode !== 0) {
      return fail("CLAUDE_FAILED", `Claude exited with code ${result.value.exitCode}`);
    }
    return ok(void 0);
  }
};
function buildSkillUpdatePrompt(skillPath, kbPath) {
  return [
    `Investigate the current state of the codebase and update the skill at ${skillPath}.`,
    "",
    "Instructions:",
    `1. Read the existing skill file at ${skillPath}.`,
    `2. Read the KB at ${kbPath} \u2014 it contains the latest codebase patterns.`,
    "3. Scan the codebase to verify the skill instructions still match reality.",
    "4. Update the skill file in place:",
    "   - Fix step-by-step instructions that reference moved/renamed files or changed patterns",
    "   - Add steps for new patterns described in the KB",
    "   - Remove steps for patterns that no longer exist",
    '   - Keep the "MANDATORY \u2014 Read Before Doing Anything" preamble intact',
    '   - Keep the "Knowledge Sync" final step intact',
    "   - Update any inline KB summaries to match the current KB",
    "5. Do NOT rewrite from scratch \u2014 revise existing sections."
  ].join("\n");
}

// src/services/deploy.service.ts
import { join as join6 } from "path";
var DeployService = class {
  constructor(fs2) {
    this.fs = fs2;
  }
  fs;
  async deploy(featureName, skillSourceDir) {
    const destinations = [
      join6(".claude", "skills", featureName),
      join6(".cursor", "skills", featureName),
      join6(".agents", "skills", featureName)
    ];
    const deployedPaths = [];
    for (const dest of destinations) {
      const ensureResult = await this.fs.ensureDir(dest);
      if (!ensureResult.ok) return ensureResult;
      const copyResult = await this.fs.copy(skillSourceDir, dest);
      if (!copyResult.ok) return copyResult;
      deployedPaths.push(dest);
    }
    return ok({ deployedPaths });
  }
  async skillDirExists(featureName) {
    const skillDir = join6(".features", featureName, "skill");
    return this.fs.isDirectory(skillDir);
  }
};

// src/commands/create.ts
import { join as join7 } from "path";
import chalk2 from "chalk";

// src/lib/naming.ts
function deriveFeatureName(topic) {
  const stopWords = /* @__PURE__ */ new Set([
    "a",
    "an",
    "the",
    "new",
    "add",
    "adding",
    "create",
    "creating",
    "implement",
    "implementing",
    "build",
    "building",
    "make",
    "making",
    "how",
    "to",
    "for",
    "in",
    "of",
    "and",
    "or",
    "with",
    "about",
    "patterns",
    "pattern",
    "conventions",
    "convention"
  ]);
  const words = topic.toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter((w) => w.length > 0 && !stopWords.has(w));
  const picked = words.slice(0, 2);
  if (picked.length === 0) {
    return "feature";
  }
  return picked.join("-");
}

// src/lib/errors.ts
import { isCancel } from "@clack/prompts";
function isCancelled(value) {
  return typeof value === "symbol" || isCancel(value);
}

// src/ui/prompts.ts
import { createInterface as createInterface2 } from "readline";
import * as p from "@clack/prompts";
import chalk from "chalk";
var BANNER = `
  ${chalk.bold.hex("#C9A227")("C")}${chalk.dim.hex("#8B7355")("hochmah")}         ${chalk.bold.hex("#C9A227")("B")}${chalk.dim.hex("#8B7355")("inah")}
  ${chalk.dim("Knowledge")}        ${chalk.dim("Skills")}
          ${chalk.dim("\\")}      ${chalk.dim("/")}
           ${chalk.bold.hex("#C9A227")("D")}${chalk.dim.hex("#8B7355")("a'at")}
         ${chalk.dim("Implementation")}          ${chalk.dim(`v${VERSION}`)}
`;
function showIntro() {
  console.log(BANNER);
  p.intro(chalk.hex("#7B68EE")("Step 1 \u2014 KB Creation"));
}
function showBinahIntro() {
  console.log();
  p.intro(chalk.hex("#7B68EE")("Step 2: Binah \u2014 Skill Creation"));
}
function showDaatIntro() {
  console.log();
  p.intro(chalk.hex("#7B68EE")("Step 3: Da'at \u2014 Deployment"));
}
function showDaatNote(featureName) {
  const command = chalk.hex("#7B68EE").bold(`/${featureName}`);
  p.log.message(
    `${chalk.hex("#7B68EE")("Invoke your new feature by typing")} ${command} ${chalk.hex("#7B68EE")("in your code agent.")}`
  );
}
function showOutro(message) {
  p.outro(message || chalk.green("Done."));
}
async function askTopic() {
  return p.text({
    message: "A brief description of the feature.",
    placeholder: "e.g., adding a new 3rd party integration",
    validate(value) {
      if (!value.trim()) return "Please describe the feature topic.";
    }
  });
}
async function askFeatureName(suggested) {
  return p.text({
    message: "Feature name?",
    initialValue: suggested || void 0,
    placeholder: suggested || "e.g., text-command",
    validate(value) {
      if (!value.trim()) return "Please provide a name.";
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.trim())) {
        return "Use kebab-case (e.g., text-command, vendor-integration)";
      }
    }
  });
}
function showFeatureFolder(path) {
  p.log.info(`Feature folder: ${chalk.hex("#C9A227").bold(path)}`);
}
function createSpinner() {
  return p.spinner();
}
function showError(message) {
  p.log.error(chalk.red(message));
}
function showInfo(message) {
  p.log.info(message);
}
function showKbNote(kbPath) {
  p.note(
    `${kbPath}

${chalk.dim("Review the KB file before proceeding to skill creation.")}`,
    "KB file ready"
  );
}
async function askKbReview(_kbPath) {
  return p.select({
    message: "How would you like to proceed?",
    options: [
      { value: "approve", label: "Approve and create skill", hint: "proceed to Binah phase" },
      { value: "edit", label: "Open in editor to revise", hint: "$EDITOR or vi" },
      { value: "skip", label: "Skip skill creation for now", hint: "run 'features skill' later" }
    ]
  });
}
function showUpdateIntro() {
  console.log(BANNER);
  p.intro(chalk.hex("#7B68EE")("Update \u2014 Refresh KB or Skill"));
}
async function askUpdateTarget(feature) {
  const options = [
    { value: "kb", label: "KB" }
  ];
  if (feature.hasSkill) {
    options.push({ value: "skill", label: "Skill" });
  } else {
    options.push({ value: "skill", label: "Skill", hint: "no skill yet \u2014 run features skill first" });
  }
  return p.select({
    message: "What do you want to update?",
    options
  });
}
async function askRedeploy() {
  return p.confirm({
    message: "Redeploy updated skill to code agents?"
  });
}
function showRunIntro() {
  console.log(BANNER);
  p.intro(chalk.hex("#7B68EE")("Implementation \u2014 Da'at"));
}
async function askSelectFeature(features) {
  return p.select({
    message: "Select a feature to run",
    options: features.map((f) => ({
      value: f.name,
      label: chalk.bold(f.name)
    }))
  });
}
async function askRunTask(feature) {
  const width = (process.stdout.columns || 100) - 2;
  const rule = chalk.dim("\u2500".repeat(width));
  const kbPath = chalk.hex("#C9A227").underline(feature.kbPath);
  const skillPath = feature.hasSkill ? chalk.hex("#7B68EE").underline(feature.skillPath) : chalk.dim(feature.skillPath);
  console.log(`  \u{1F4DA}  ${kbPath}  \u{1F6E0}   ${skillPath}`);
  console.log(`  ${rule}`);
  process.stdout.write(`
  ${rule}
`);
  process.stdout.write("\x1B[2A\r");
  return new Promise((res) => {
    const rl = createInterface2({ input: process.stdin, output: process.stdout });
    let sigintCount = 0;
    const done = (value) => {
      rl.close();
      process.stdout.write("\x1B[1B\n");
      res(value);
    };
    rl.on("SIGINT", () => {
      sigintCount++;
      if (sigintCount >= 2) {
        done(/* @__PURE__ */ Symbol("cancel"));
        return;
      }
      const hint = chalk.dim("  Press Ctrl-C again to exit");
      process.stdout.write(`\x1B[s\x1B[2B\r${hint}\x1B[u`);
    });
    rl.question(`  ${chalk.hex("#7B68EE")(">")} `, (answer) => {
      done(answer.trim() || /* @__PURE__ */ Symbol("cancel"));
    });
  });
}

// src/commands/create.ts
function handleError(error) {
  showError(error.message);
}
function makeCreateCommand(deps) {
  const { kbService: kbService2, skillService: skillService2, deployService: deployService2, editorClient: editorClient2 } = deps;
  return async function createCommand2(topic, options) {
    showIntro();
    let finalTopic = topic;
    if (!finalTopic) {
      const result = await askTopic();
      if (isCancelled(result)) {
        showOutro("Cancelled.");
        return;
      }
      finalTopic = result;
    }
    const suggested = deriveFeatureName(finalTopic);
    const nameResult = await askFeatureName(suggested);
    if (isCancelled(nameResult)) {
      showOutro("Cancelled.");
      return;
    }
    const featureName = toFeatureName(nameResult);
    const model = resolveModel(options.model, DEFAULT_MODEL);
    showFeatureFolder(join7(".features", featureName));
    const spin = createSpinner();
    spin.start("Installing dependencies...");
    const installResult = await skillService2.ensureSkillCreator();
    if (!installResult.ok) {
      spin.stop("Failed to install dependencies.");
      handleError(installResult.error);
      return;
    }
    spin.stop("Dependencies ready.");
    showInfo("Launching Claude Code with KB creator...");
    console.log();
    const kbResult = await kbService2.createKB(featureName, finalTopic, model);
    if (!kbResult.ok) {
      console.log();
      handleError(kbResult.error);
      showOutro(`Partial feature at .features/${featureName}/`);
      return;
    }
    console.log();
    showKbNote(kbResult.value);
    const shortName = stripFeaturePrefix(featureName);
    while (true) {
      const review = await askKbReview(kbResult.value);
      if (isCancelled(review) || review === "skip") {
        showInfo(`You can create the skill later with: features skill ${shortName}`);
        showOutro(`KB saved at .features/${featureName}/`);
        return;
      }
      if (review === "edit") {
        const editResult = await editorClient2.open(kbResult.value);
        if (!editResult.ok) {
          showError(`${editResult.error.message}. Set $EDITOR and try again, or edit the file manually.`);
        }
        continue;
      }
      break;
    }
    showInfo("Launching Claude Code with Skill creator...");
    console.log();
    const skillResult = await skillService2.createSkill({
      featureName,
      topic: finalTopic,
      kbPath: kbResult.value,
      model
    });
    console.log();
    if (!skillResult.ok) {
      handleError(skillResult.error);
      showOutro(`Skill creation failed. KB was saved.`);
      return;
    }
    if (skillResult.value !== 0) {
      showOutro(`Skill creation exited with code ${skillResult.value}. KB was saved.`);
      return;
    }
    const skillExists = await deployService2.skillDirExists(featureName);
    if (!skillExists) {
      showError("Skill directory not found. Skipping deployment.");
      showOutro(`Partially created at .features/${featureName}/`);
      return;
    }
    showDaatIntro();
    showInfo("Deploying feature to code agents...");
    console.log();
    const skillDir = join7(".features", featureName, "skill");
    const deployResult = await deployService2.deploy(featureName, skillDir);
    if (!deployResult.ok) {
      showError(`Deployment failed: ${deployResult.error.message}`);
      showOutro(`Skill saved at .features/${featureName}/skill/ \u2014 deploy manually.`);
      return;
    }
    showDaatNote(featureName);
    showInfo(`Run ${chalk2.hex("#7B68EE").bold("features")} to implement.`);
    showOutro(`${featureName} is ready.`);
  };
}

// src/commands/run.ts
function makeRunCommand(deps) {
  const { featureService: featureService2 } = deps;
  return async function runCommand2(options) {
    showRunIntro();
    const featuresResult = await featureService2.listFeatures();
    if (!featuresResult.ok) {
      showError(featuresResult.error.message);
      showOutro();
      return;
    }
    const features = featuresResult.value;
    if (features.length === 0) {
      showError("No features found. Run `features create` first to build a feature from your codebase.");
      showOutro();
      return;
    }
    let selectedName;
    if (features.length === 1) {
      selectedName = features[0].name;
      showInfo(`Using ${selectedName}`);
    } else {
      const result2 = await askSelectFeature(features);
      if (isCancelled(result2)) {
        showOutro("Cancelled.");
        return;
      }
      selectedName = result2;
    }
    const selected = features.find((f) => f.name === selectedName);
    if (!selected) {
      showError(`Feature "${selectedName}" not found.`);
      showOutro();
      return;
    }
    const taskResult = await askRunTask(selected);
    if (isCancelled(taskResult)) {
      showOutro("Cancelled.");
      return;
    }
    const model = resolveModel(options.model, DEFAULT_MODEL);
    const result = await featureService2.executeFeature(selected, taskResult, model);
    if (!result.ok) {
      showError(result.error.message);
    }
  };
}

// src/commands/skill.ts
import { join as join8 } from "path";
function makeSkillCommand(deps) {
  const { skillService: skillService2, fs: fs2 } = deps;
  return async function skillCommand2(featureNameArg, options) {
    showIntro();
    let rawName = featureNameArg;
    if (!rawName) {
      const result = await askFeatureName("");
      if (isCancelled(result)) {
        showOutro("Cancelled.");
        return;
      }
      rawName = result;
    }
    const featureName = toFeatureName(rawName);
    const kbPath = join8(".features", featureName, "kb", "KNOWLEDGE.md");
    const legacyKbPath = join8(".features", featureName, "kb", "knowledge.md");
    const legacyKbPath2 = join8(".features", featureName, "knowledge", "knowledge.md");
    let resolvedKbPath;
    if (await fs2.exists(kbPath)) {
      resolvedKbPath = kbPath;
    } else if (await fs2.exists(legacyKbPath)) {
      resolvedKbPath = legacyKbPath;
    } else if (await fs2.exists(legacyKbPath2)) {
      resolvedKbPath = legacyKbPath2;
    } else {
      showError(`KB not found at ${kbPath}. Run 'features create' first.`);
      return;
    }
    const topic = featureName.replace(/^features-/, "").replace(/-/g, " ");
    const model = resolveModel(options.model, DEFAULT_MODEL);
    showBinahIntro();
    const exitCodeResult = await skillService2.createSkill({
      featureName,
      topic,
      kbPath: resolvedKbPath,
      model
    });
    console.log();
    if (!exitCodeResult.ok) {
      showError(exitCodeResult.error.message);
      showOutro();
      return;
    }
    if (exitCodeResult.value === 0) {
      showOutro(`Skill created at .features/${featureName}/skill/`);
    } else {
      showOutro(`Claude exited with code ${exitCodeResult.value}.`);
    }
  };
}

// src/commands/update.ts
import { join as join9 } from "path";
import chalk3 from "chalk";
function makeUpdateCommand(deps) {
  const { featureService: featureService2, kbService: kbService2, skillService: skillService2, deployService: deployService2 } = deps;
  return async function updateCommand2(featureNameArg, options) {
    showUpdateIntro();
    const featuresResult = await featureService2.listFeatures();
    if (!featuresResult.ok) {
      showError(featuresResult.error.message);
      showOutro();
      return;
    }
    const features = featuresResult.value;
    if (features.length === 0) {
      showError("No features found. Run `features create` first to build a feature from your codebase.");
      showOutro();
      return;
    }
    let selected;
    if (featureNameArg) {
      const normalized = toFeatureName(featureNameArg);
      selected = features.find((f) => f.name === normalized);
      if (!selected) {
        showError(`Feature "${normalized}" not found. Available: ${features.map((f) => f.name).join(", ")}`);
        showOutro();
        return;
      }
      showInfo(`Using ${selected.name}`);
    } else if (features.length === 1) {
      selected = features[0];
      showInfo(`Using ${selected.name}`);
    } else {
      const result = await askSelectFeature(features);
      if (isCancelled(result)) {
        showOutro("Cancelled.");
        return;
      }
      selected = features.find((f) => f.name === result);
      if (!selected) {
        showError(`Feature "${result}" not found.`);
        showOutro();
        return;
      }
    }
    const targetResult = await askUpdateTarget(selected);
    if (isCancelled(targetResult)) {
      showOutro("Cancelled.");
      return;
    }
    const target = targetResult;
    if (target === "skill" && !selected.hasSkill) {
      const shortName = selected.name.replace("features-", "");
      showError(`No skill found for ${selected.name}. Run \`features skill ${shortName}\` first.`);
      showOutro();
      return;
    }
    const model = resolveModel(options.model, DEFAULT_MODEL);
    const label = target === "kb" ? "KB" : "skill";
    showInfo(`Updating ${label} for ${chalk3.bold(selected.name)}...`);
    console.log();
    if (target === "kb") {
      const result = await kbService2.updateKB(selected, model);
      console.log();
      if (!result.ok) {
        showError(result.error.message);
        showOutro();
        return;
      }
    } else {
      const result = await skillService2.updateSkill(selected, model);
      console.log();
      if (!result.ok) {
        showError(result.error.message);
        showOutro();
        return;
      }
    }
    if (target === "skill") {
      const redeployResult = await askRedeploy();
      if (isCancelled(redeployResult)) {
        showOutro(`Skill updated at ${selected.skillPath}`);
        return;
      }
      if (redeployResult) {
        const skillDir = join9(".features", selected.name, "skill");
        const deployResult = await deployService2.deploy(selected.name, skillDir);
        if (!deployResult.ok) {
          showError(`Redeploy failed: ${deployResult.error.message}`);
        } else {
          showInfo("Redeployed to .claude/skills/, .cursor/skills/, .agents/skills/");
        }
      }
    }
    const targetPath = target === "kb" ? selected.kbPath : selected.skillPath;
    showOutro(`Updated ${targetPath}`);
  };
}

// src/index.ts
var fs = new FilesystemRepository(process.cwd());
var featureRepo = new FeatureRepository(fs);
var claudeClient = new ClaudeClient();
var gitClient = new GitClient();
var editorClient = new EditorClient();
var featureService = new FeatureService(featureRepo, claudeClient);
var kbService = new KBService(fs, claudeClient);
var skillService = new SkillService(fs, claudeClient, gitClient);
var deployService = new DeployService(fs);
var createCommand = makeCreateCommand({ kbService, skillService, deployService, editorClient });
var runCommand = makeRunCommand({ featureService });
var skillCommand = makeSkillCommand({ skillService, fs });
var updateCommand = makeUpdateCommand({ featureService, kbService, skillService, deployService });
program.name("features").description("Create AI-powered features from your codebase").version(VERSION);
program.command("run", { isDefault: true }).description("Run a feature \u2014 implement with KB-powered Claude Code").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(runCommand);
program.command("create").description("Create a new feature (KB + Skill)").argument("[topic]", "What the feature should know about").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(createCommand);
program.command("skill").description("Create a skill for an existing feature (Binah phase)").argument("[feature-name]", "Name of existing feature (e.g., text-command)").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(skillCommand);
program.command("update").description("Update an existing feature's KB or skill").argument("[feature-name]", "Name of feature to update (e.g., text-command)").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(updateCommand);
program.parse();
