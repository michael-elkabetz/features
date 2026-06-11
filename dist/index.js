#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/index.ts
import { program } from "commander";

// src/version.ts
var VERSION = "0.1.1";

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
import { unlink, writeFile as writeFile2 } from "fs/promises";
import { tmpdir } from "os";
import { join as join2 } from "path";
import { createInterface } from "readline";
import ora from "ora";
var ClaudeClient = class {
  async execute(options) {
    const { systemPrompt, systemPromptFile, appendSystemPrompt, appendSystemPromptFile, userPrompt, model, print, onEvent, cwd: cwd2, signal } = options;
    const tmpFiles = [];
    const args = [];
    if (print) {
      args.push("-p", "--verbose", "--output-format", "stream-json", "--permission-mode", "acceptEdits");
    }
    if (systemPromptFile) {
      args.push("--system-prompt-file", systemPromptFile);
    } else if (systemPrompt) {
      const tmpFile = join2(tmpdir(), `features-sys-${process.pid}-${Math.random().toString(36).slice(2)}.md`);
      await writeFile2(tmpFile, systemPrompt, "utf-8");
      tmpFiles.push(tmpFile);
      args.push("--system-prompt-file", tmpFile);
    }
    if (appendSystemPromptFile) {
      args.push("--append-system-prompt-file", appendSystemPromptFile);
    } else if (appendSystemPrompt) {
      const tmpFile = join2(tmpdir(), `features-append-${process.pid}-${Math.random().toString(36).slice(2)}.md`);
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
    return new Promise((resolve3) => {
      const child = spawn("claude", args, {
        cwd: cwd2,
        stdio: print ? ["ignore", "pipe", "inherit"] : "inherit"
      });
      let aborted = false;
      if (signal) {
        const onAbort = () => {
          aborted = true;
          child.kill("SIGTERM");
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
          child.on("close", () => signal.removeEventListener("abort", onAbort));
        }
      }
      let activeSpinner = null;
      let resultIsError = false;
      let resultEvent = null;
      if (print && child.stdout) {
        const rl = createInterface({ input: child.stdout });
        rl.on("line", (line) => {
          try {
            const parsed2 = JSON.parse(line);
            if (!isClaudeStreamEvent(parsed2)) return;
            if (parsed2.type === "result") {
              if (parsed2.is_error) resultIsError = true;
              resultEvent = parsed2;
            }
            if (onEvent) {
              onEvent(parsed2);
            } else {
              activeSpinner = renderStreamEvent(parsed2, activeSpinner);
            }
          } catch {
          }
        });
      }
      child.on("error", (err) => {
        cleanup();
        stopSpinner(activeSpinner);
        if (err.code === "ENOENT") {
          resolve3(
            fail("CLAUDE_NOT_FOUND", "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code")
          );
        } else {
          resolve3(fail("CLAUDE_FAILED", `Claude process error: ${err.message}`, err));
        }
      });
      child.on("close", (code) => {
        cleanup();
        stopSpinner(activeSpinner);
        if (aborted) {
          resolve3(fail("CLAUDE_ABORTED", "Claude process was interrupted"));
          return;
        }
        if (code !== 0) {
          resolve3(fail("CLAUDE_FAILED", `Claude exited with code ${code ?? "unknown"}`));
          return;
        }
        if (resultIsError) {
          resolve3(fail("CLAUDE_FAILED", "Claude reported an error result"));
          return;
        }
        resolve3(ok({
          exitCode: code ?? 0,
          costUsd: resultEvent?.total_cost_usd,
          durationMs: resultEvent?.duration_ms,
          numTurns: resultEvent?.num_turns,
          inputTokens: resultEvent?.usage?.input_tokens,
          outputTokens: resultEvent?.usage?.output_tokens,
          cacheReadTokens: resultEvent?.usage?.cache_read_input_tokens
        }));
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
function renderStreamEvent(event, activeSpinner) {
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
import { exec as execCb, execFile } from "child_process";
import { promisify } from "util";
var exec = promisify(execCb);
var execFileAsync = promisify(execFile);
var GitClient = class {
  repoDir;
  constructor(repoDir) {
    this.repoDir = repoDir ?? process.cwd();
  }
  // --- Clone operations (used by existing skill/create commands) ---
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
  // --- Read-only queries (used by analysis pipeline) ---
  async git(args) {
    try {
      const { stdout } = await execFileAsync("git", args, { cwd: this.repoDir, maxBuffer: 10 * 1024 * 1024 });
      return ok(stdout.trim());
    } catch (err) {
      return fail("GIT_FAILED", `git ${args[0]} failed: ${err.message}`, err);
    }
  }
  async headSha() {
    return this.git(["rev-parse", "--short", "HEAD"]);
  }
  async blobSha(path) {
    const result = await this.git(["rev-parse", `HEAD:${path}`]);
    return result.ok ? result.value.slice(0, 7) : void 0;
  }
  async changedFilesSince(sha) {
    const result = await this.git(["diff", "--name-only", sha]);
    if (!result.ok) return result;
    return ok(result.value === "" ? [] : result.value.split("\n"));
  }
  async trackedFileCount() {
    const result = await this.git(["ls-files"]);
    if (!result.ok) return void 0;
    return result.value === "" ? 0 : result.value.split("\n").length;
  }
  async isRepo() {
    const result = await this.git(["rev-parse", "--is-inside-work-tree"]);
    return result.ok && result.value === "true";
  }
};

// src/clients/editor.client.ts
import { spawn as spawn2 } from "child_process";
var EditorClient = class {
  open(filePath) {
    const editor = process.env.VISUAL || process.env.EDITOR || "vi";
    return new Promise((resolve3) => {
      const child = spawn2(editor, [filePath], {
        stdio: "inherit"
      });
      child.on("error", (err) => {
        resolve3(fail("EDITOR_FAILED", `Failed to open editor (${editor}): ${err.message}`, err));
      });
      child.on("close", () => {
        resolve3(ok(void 0));
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

// src/services/analyze.service.ts
import { z as z5 } from "zod";

// src/spec/version.ts
var SPEC_VERSION = 1;

// src/spec/types.ts
function parsed(doc, warnings = []) {
  return { ok: true, doc, warnings };
}
function failed(issues) {
  return { ok: false, issues };
}
function issue(code, message, line) {
  return line === void 0 ? { code, message } : { code, message, line };
}

// src/spec/schema/ref.ts
import { z } from "zod";
var LineRangeSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive()
}).refine((r) => r.end >= r.start, { message: "end must be >= start" });
var CodeRefSchema = z.object({
  /** Repo-relative path to the source file. */
  path: z.string().min(1),
  lines: LineRangeSchema,
  /** Symbol expected within the range (verification anchor). Simple or qualified (Outer.method). */
  symbol: z.string().min(1).optional(),
  /** Plain-English description of what this file/piece does. */
  what: z.string().min(1),
  /** Annotation explaining why this code matters. */
  note: z.string().optional(),
  /** Short git sha (commit or blob) captured at analysis time. */
  sha: z.string().regex(/^[0-9a-f]{6,40}$/i, "sha must be a hex git sha (6-40 chars)").optional()
});
var KNOWN_KEYS = /* @__PURE__ */ new Set(["path", "lines", "symbol", "what", "note", "sha"]);
function parseLineRange(raw) {
  const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(raw.trim());
  if (!m) return void 0;
  const start = Number(m[1]);
  const end = m[2] === void 0 ? start : Number(m[2]);
  if (start < 1 || end < start) return void 0;
  return { start, end };
}
function parseRefBlock(body, baseLine = 1) {
  const issues = [];
  const fields = {};
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const m = /^(\w+)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      issues.push(issue("malformed-ref", `Unparseable line in ref block: "${line.trim()}"`, baseLine + i));
      continue;
    }
    const key = m[1];
    let value = m[2].trim();
    value = value.replace(/\s+#.*$/, "").trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (!KNOWN_KEYS.has(key)) {
      issues.push(issue("unknown-ref-key", `Unknown key "${key}" in ref block`, baseLine + i));
      continue;
    }
    fields[key] = value;
  }
  const range = fields["lines"] !== void 0 ? parseLineRange(fields["lines"]) : void 0;
  if (fields["lines"] !== void 0 && !range) {
    issues.push(issue("malformed-ref", `Invalid lines value "${fields["lines"]}" \u2014 expected "12-28" or "42"`, baseLine));
  }
  const candidate = {
    path: fields["path"],
    lines: range,
    symbol: fields["symbol"],
    what: fields["what"],
    note: fields["note"],
    sha: fields["sha"]?.toLowerCase()
  };
  const result = CodeRefSchema.safeParse(candidate);
  if (!result.success) {
    for (const e of result.error.issues) {
      issues.push(issue("malformed-ref", `ref.${e.path.join(".")}: ${e.message}`, baseLine));
    }
    return failed(issues);
  }
  if (issues.length > 0) return failed(issues);
  return parsed(result.data);
}

// src/spec/schema/feature.ts
import { z as z2 } from "zod";
var SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
var FeatureStatusSchema = z2.enum(["stable", "beta", "legacy"]);
var FeatureComplexitySchema = z2.enum(["simple", "moderate", "complex"]);
var FeatureFrontmatterSchema = z2.object({
  id: z2.string().regex(SLUG_PATTERN, "id must be a kebab-case slug"),
  area: z2.string().regex(SLUG_PATTERN, "area must be a kebab-case slug"),
  name: z2.string().min(1),
  summary: z2.string().min(1),
  status: FeatureStatusSchema,
  complexity: FeatureComplexitySchema,
  related: z2.array(z2.string().regex(SLUG_PATTERN)).default([]),
  specVersion: z2.literal(1),
  /** Repo HEAD sha at analysis time; drives feature-level staleness. */
  analyzedAt: z2.string().regex(/^[0-9a-f]{6,40}$/i).optional()
});
var FlowStepSchema = z2.object({
  label: z2.string().min(1),
  sub: z2.string().optional()
});
var FeatureDocSchema = z2.object({
  frontmatter: FeatureFrontmatterSchema,
  nutshell: z2.string().min(1),
  howItWorks: z2.array(z2.string().min(1)).min(1),
  flow: z2.array(FlowStepSchema),
  refs: z2.array(CodeRefSchema).min(1)
});
var FEATURE_SECTIONS = {
  nutshell: "In a nutshell",
  howItWorks: "How it works",
  flow: "Flow",
  refs: "Code references",
  related: "Related"
};
var REQUIRED_FEATURE_SECTIONS = [
  FEATURE_SECTIONS.nutshell,
  FEATURE_SECTIONS.howItWorks,
  FEATURE_SECTIONS.refs
];

// src/spec/schema/overview.ts
import { z as z3 } from "zod";
var OverviewFrontmatterSchema = z3.object({
  /** Display name, e.g. "acme/maple". */
  name: z3.string().min(1),
  tagline: z3.string().min(1),
  /** e.g. "TypeScript + React". */
  language: z3.string().min(1),
  specVersion: z3.literal(1),
  analyzedAt: z3.string().regex(/^[0-9a-f]{6,40}$/i).optional()
});
var AreaSchema = z3.object({
  id: z3.string().regex(SLUG_PATTERN, "area id must be a kebab-case slug"),
  name: z3.string().min(1),
  /** Icon name the viewer maps to an SVG (e.g. "chat", "hash", "shield"). */
  icon: z3.string().min(1),
  blurb: z3.string().min(1)
});
var OverviewDocSchema = z3.object({
  frontmatter: OverviewFrontmatterSchema,
  description: z3.string().min(1),
  areas: z3.array(AreaSchema).min(1)
});
var OVERVIEW_SECTIONS = {
  description: "Description",
  areas: "Areas"
};

// src/spec/schema/manifest.ts
import { z as z4 } from "zod";
var RefProvenanceSchema = z4.enum(["verified", "healed", "unverified", "stale"]);
var StaleReasonSchema = z4.enum(["symbol-not-found", "file-missing", "lines-out-of-range"]);
var ManifestRefSchema = z4.object({
  path: z4.string().min(1),
  /** Language tag for syntax highlighting, inferred from the extension. */
  lang: z4.string(),
  what: z4.string(),
  annotation: z4.string().optional(),
  /** The range the snippet was extracted from (post-healing). */
  lines: LineRangeSchema,
  symbol: z4.string().optional(),
  /** Extracted at compile time from the live repo — never authored. */
  code: z4.string(),
  provenance: RefProvenanceSchema,
  verifiedBy: z4.enum(["tree-sitter", "grep", "none"]),
  /** True when the authored range drifted and was auto-corrected via symbol resolution. */
  healed: z4.boolean(),
  stale: z4.boolean(),
  staleReason: StaleReasonSchema.optional()
});
var ManifestFeatureSchema = z4.object({
  id: z4.string().regex(SLUG_PATTERN),
  area: z4.string().regex(SLUG_PATTERN),
  name: z4.string().min(1),
  summary: z4.string().min(1),
  status: FeatureStatusSchema,
  complexity: FeatureComplexitySchema,
  nutshell: z4.string().min(1),
  howItWorks: z4.array(z4.string()),
  flow: z4.array(FlowStepSchema),
  files: z4.array(ManifestRefSchema),
  related: z4.array(z4.string()),
  /** True when files this feature references changed since it was analyzed. */
  featureStale: z4.boolean()
});
var ManifestStatsSchema = z4.object({
  files: z4.number().int().nonnegative(),
  features: z4.number().int().nonnegative(),
  areas: z4.number().int().nonnegative(),
  /** ISO timestamp of the compile. */
  lastAnalyzed: z4.string()
});
var ManifestSchema = z4.object({
  specVersion: z4.literal(1),
  repo: z4.object({
    name: z4.string(),
    tagline: z4.string(),
    description: z4.string(),
    language: z4.string(),
    stats: ManifestStatsSchema
  }),
  areas: z4.array(AreaSchema),
  features: z4.array(ManifestFeatureSchema)
});

// src/spec/parse/frontmatter.ts
import matter from "gray-matter";
function parseFrontmatter(source) {
  try {
    const parsed2 = matter(source);
    if (Object.keys(parsed2.data).length === 0) {
      return {
        data: {},
        body: parsed2.content,
        bodyOffset: 0,
        issues: [issue("missing-frontmatter", "Document has no YAML frontmatter block")]
      };
    }
    const bodyOffset = source.length - parsed2.content.length;
    const offsetLines = source.slice(0, bodyOffset).split("\n").length - 1;
    return { data: parsed2.data, body: parsed2.content, bodyOffset: offsetLines, issues: [] };
  } catch (e) {
    return {
      data: {},
      body: source,
      bodyOffset: 0,
      issues: [issue("bad-frontmatter", `Frontmatter is not valid YAML: ${e.message}`)]
    };
  }
}

// src/spec/parse/sections.ts
import { fromMarkdown } from "mdast-util-from-markdown";
function parseMarkdown(md) {
  return fromMarkdown(md);
}
function splitSections(tree) {
  const sections = [];
  let current;
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      if (current) sections.push(current);
      current = {
        title: phrasingToString(node.children).trim(),
        nodes: [],
        line: node.position?.start.line ?? 1
      };
      continue;
    }
    current?.nodes.push(node);
  }
  if (current) sections.push(current);
  return sections;
}
function phrasingToString(children) {
  let out = "";
  for (const child of children) {
    switch (child.type) {
      case "text":
      case "inlineCode":
        out += child.value;
        break;
      case "emphasis":
      case "strong":
      case "delete":
      case "link":
        out += phrasingToString(child.children);
        break;
      case "break":
        out += " ";
        break;
      default:
        break;
    }
  }
  return out;
}
function sectionProse(nodes) {
  const parts = [];
  for (const node of nodes) {
    if (node.type === "paragraph") {
      parts.push(phrasingToString(node.children).trim());
    }
  }
  return parts.join("\n\n").trim();
}
function sectionListItems(nodes) {
  const list = nodes.find((n) => n.type === "list");
  if (!list) return [];
  return list.children.map((item) => {
    const para = item.children.find((c) => c.type === "paragraph");
    return para ? phrasingToString(para.children).trim() : "";
  });
}
function sectionCodeBlocks(nodes, lang) {
  const blocks = [];
  for (const node of nodes) {
    if (node.type === "code" && node.lang === lang) {
      blocks.push({
        value: node.value,
        // +1: content starts on the line after the opening fence
        line: (node.position?.start.line ?? 0) + 1
      });
    }
  }
  return blocks;
}

// src/spec/parse/feature-parser.ts
function parseFlowStep(item) {
  for (const sep of [" \u2014 ", " \u2013 ", " - ", ": "]) {
    const idx = item.indexOf(sep);
    if (idx > 0) {
      return { label: item.slice(0, idx).trim(), sub: item.slice(idx + sep.length).trim() };
    }
  }
  return { label: item.trim() };
}
function parseFeature(source) {
  const issues = [];
  const fm = parseFrontmatter(source);
  issues.push(...fm.issues);
  const fmResult = FeatureFrontmatterSchema.safeParse(fm.data);
  if (!fmResult.success) {
    for (const e of fmResult.error.issues) {
      issues.push(issue("bad-frontmatter", `frontmatter.${e.path.join(".")}: ${e.message}`));
    }
  }
  const tree = parseMarkdown(fm.body);
  const sections = new Map(splitSections(tree).map((s) => [s.title, s]));
  const missing = (title) => issues.push(issue("missing-section", `Required section "## ${title}" is missing or empty`));
  const nutshellSection = sections.get(FEATURE_SECTIONS.nutshell);
  const nutshell = nutshellSection ? sectionProse(nutshellSection.nodes) : "";
  if (!nutshell) missing(FEATURE_SECTIONS.nutshell);
  const howSection = sections.get(FEATURE_SECTIONS.howItWorks);
  const howItWorks = howSection ? sectionListItems(howSection.nodes).filter(Boolean) : [];
  if (howItWorks.length === 0) missing(FEATURE_SECTIONS.howItWorks);
  const flowSection = sections.get(FEATURE_SECTIONS.flow);
  const flow = flowSection ? sectionListItems(flowSection.nodes).filter(Boolean).map(parseFlowStep) : [];
  const refsSection = sections.get(FEATURE_SECTIONS.refs);
  const refs = [];
  if (!refsSection) {
    missing(FEATURE_SECTIONS.refs);
  } else {
    const blocks = sectionCodeBlocks(refsSection.nodes, "ref");
    if (blocks.length === 0) {
      issues.push(
        issue(
          "missing-refs",
          `Section "## ${FEATURE_SECTIONS.refs}" has no \`\`\`ref blocks`,
          refsSection.line + fm.bodyOffset
        )
      );
    }
    for (const block of blocks) {
      const refResult = parseRefBlock(block.value, block.line + fm.bodyOffset);
      if (refResult.ok) refs.push(refResult.doc);
      else issues.push(...refResult.issues);
    }
  }
  if (issues.length > 0) return failed(issues);
  return parsed({
    frontmatter: fmResult.success ? fmResult.data : void 0,
    nutshell,
    howItWorks,
    flow,
    refs
  });
}

// src/spec/parse/overview-parser.ts
function parseAreaBlock(body, baseLine) {
  const issues = [];
  const fields = {};
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const m = /^(\w+)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      issues.push(issue("malformed-area", `Unparseable line in area block: "${line.trim()}"`, baseLine + i));
      continue;
    }
    fields[m[1]] = m[2].trim();
  }
  const result = AreaSchema.safeParse(fields);
  if (!result.success) {
    for (const e of result.error.issues) {
      issues.push(issue("malformed-area", `area.${e.path.join(".")}: ${e.message}`, baseLine));
    }
    return { issues };
  }
  return { area: result.data, issues };
}
function parseOverview(source) {
  const issues = [];
  const fm = parseFrontmatter(source);
  issues.push(...fm.issues);
  const fmResult = OverviewFrontmatterSchema.safeParse(fm.data);
  if (!fmResult.success) {
    for (const e of fmResult.error.issues) {
      issues.push(issue("bad-frontmatter", `frontmatter.${e.path.join(".")}: ${e.message}`));
    }
  }
  const tree = parseMarkdown(fm.body);
  const sections = new Map(splitSections(tree).map((s) => [s.title, s]));
  const descSection = sections.get(OVERVIEW_SECTIONS.description);
  const description = descSection ? sectionProse(descSection.nodes) : "";
  if (!description) {
    issues.push(issue("missing-section", `Required section "## ${OVERVIEW_SECTIONS.description}" is missing or empty`));
  }
  const areasSection = sections.get(OVERVIEW_SECTIONS.areas);
  const areas = [];
  if (!areasSection) {
    issues.push(issue("missing-section", `Required section "## ${OVERVIEW_SECTIONS.areas}" is missing`));
  } else {
    const blocks = sectionCodeBlocks(areasSection.nodes, "area");
    if (blocks.length === 0) {
      issues.push(issue("missing-areas", `Section "## ${OVERVIEW_SECTIONS.areas}" has no \`\`\`area blocks`));
    }
    const seen = /* @__PURE__ */ new Set();
    for (const block of blocks) {
      const { area, issues: blockIssues } = parseAreaBlock(block.value, block.line + fm.bodyOffset);
      issues.push(...blockIssues);
      if (area) {
        if (seen.has(area.id)) {
          issues.push(issue("duplicate-area", `Area id "${area.id}" is defined more than once`, block.line + fm.bodyOffset));
        } else {
          seen.add(area.id);
          areas.push(area);
        }
      }
    }
  }
  if (issues.length > 0) return failed(issues);
  return parsed({
    frontmatter: fmResult.success ? fmResult.data : void 0,
    description,
    areas
  });
}

// src/spec/validate/validate.ts
function validateProject(overview, features) {
  const issues = [];
  const areaIds = new Set(overview.areas.map((a) => a.id));
  const featureIds = /* @__PURE__ */ new Set();
  for (const feature of features) {
    const { id, area, related } = feature.frontmatter;
    if (featureIds.has(id)) {
      issues.push(issue("duplicate-feature", `Feature id "${id}" is defined more than once`));
    }
    featureIds.add(id);
    if (!areaIds.has(area)) {
      issues.push(issue("unknown-area", `Feature "${id}" references area "${area}" which is not defined in overview.md`));
    }
    for (const rel of related) {
      if (rel === id) {
        issues.push(issue("self-related", `Feature "${id}" lists itself in related`));
      }
    }
  }
  for (const feature of features) {
    for (const rel of feature.frontmatter.related) {
      if (rel !== feature.frontmatter.id && !featureIds.has(rel)) {
        issues.push(
          issue("unknown-related", `Feature "${feature.frontmatter.id}" relates to "${rel}" which does not exist`)
        );
      }
    }
  }
  const usedAreas = new Set(features.map((f) => f.frontmatter.area));
  for (const area of overview.areas) {
    if (!usedAreas.has(area.id)) {
      issues.push(issue("empty-area", `Area "${area.id}" has no features`));
    }
  }
  return issues;
}
var WARNING_CODES = /* @__PURE__ */ new Set(["empty-area"]);
function splitIssues(issues) {
  const errors = [];
  const warnings = [];
  for (const i of issues) (WARNING_CODES.has(i.code) ? warnings : errors).push(i);
  return { errors, warnings };
}

// src/lib/analysis-config.ts
import { join as join7 } from "path";
var ANALYSIS_DIR = ".features";
var ANALYSIS_FEATURES_DIR = join7(ANALYSIS_DIR, "features");
var SKILLS_DIR = join7(ANALYSIS_DIR, "skills");
var OVERVIEW_FILE = join7(ANALYSIS_DIR, "overview.md");
var INVENTORY_FILE = join7(ANALYSIS_FEATURES_DIR, "_inventory.json");
var MANIFEST_FILE = join7(ANALYSIS_DIR, "manifest.json");
var DEFAULT_SERVE_PORT = 4747;
var PROMPTS_DIR = join7(PACKAGE_ROOT, "prompts");
var INVENTORY_PROMPT_PATH = join7(PROMPTS_DIR, "INVENTORY.md");
var DEEPDIVE_PROMPT_PATH = join7(PROMPTS_DIR, "FEATURE-DEEPDIVE.md");
var FEATURE_SKILL_PROMPT_PATH = join7(PROMPTS_DIR, "FEATURE-SKILL.md");
var COMBINED_PROMPT_PATH = join7(PROMPTS_DIR, "FEATURE-COMBINED.md");
var VIEWER_DIST_DIR = join7(PACKAGE_ROOT, "viewer-dist");

// src/services/analyze.service.ts
var InventoryEntrySchema = z5.object({
  id: z5.string().regex(SLUG_PATTERN),
  area: z5.string().regex(SLUG_PATTERN),
  name: z5.string().min(1),
  summary: z5.string().min(1)
});
var InventorySchema = z5.array(InventoryEntrySchema).min(1);
var MAX_REPAIRS = 2;
function budgetHint(fileCount) {
  if (fileCount < 200) return `This is a small repo (~${fileCount} files). Keep exploration minimal \u2014 1-2 directory scans max.`;
  if (fileCount < 2e3) return `This is a medium repo (~${fileCount} files). Moderate exploration \u2014 scan entry points, avoid recursive reads.`;
  return `This is a large repo (~${fileCount} files). Full exploration allowed.`;
}
var CODEGRAPH_ADDENDUM = [
  "## Codegraph Available",
  "This repo has a codegraph index (.codegraph/). Use codegraph_explore as your PRIMARY",
  "tool for discovering features and tracing flows \u2014 one call with symbol names replaces",
  "multiple file reads. Use codegraph_search for symbol lookup. Only fall back to",
  "Read/Grep for details codegraph didn't cover."
].join("\n");
var AnalyzeService = class {
  constructor(fs2, git, claude) {
    this.fs = fs2;
    this.git = git;
    this.claude = claude;
  }
  fs;
  git;
  claude;
  _stats = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, durationMs: 0, turns: 0, calls: 0, repairs: 0 };
  /** Snapshot of accumulated token/cost stats across all Claude calls in this service instance. */
  get stats() {
    return {
      totalCostUsd: this._stats.costUsd,
      totalInputTokens: this._stats.inputTokens,
      totalOutputTokens: this._stats.outputTokens,
      totalCacheReadTokens: this._stats.cacheReadTokens,
      totalDurationMs: this._stats.durationMs,
      totalTurns: this._stats.turns,
      callCount: this._stats.calls,
      repairCount: this._stats.repairs
    };
  }
  resetStats() {
    this._stats = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, durationMs: 0, turns: 0, calls: 0, repairs: 0 };
  }
  trackCall(result, isRepair = false) {
    this._stats.costUsd += result.costUsd ?? 0;
    this._stats.inputTokens += result.inputTokens ?? 0;
    this._stats.outputTokens += result.outputTokens ?? 0;
    this._stats.cacheReadTokens += result.cacheReadTokens ?? 0;
    this._stats.durationMs += result.durationMs ?? 0;
    this._stats.turns += result.numTurns ?? 0;
    this._stats.calls++;
    if (isRepair) this._stats.repairs++;
  }
  /** Translate Claude stream events into coarse progress events for an observer. */
  claudeObserver(onProgress) {
    if (!onProgress) return void 0;
    return (event) => {
      if (event.type === "assistant") {
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_use") {
            const input = block.input ?? {};
            const detail = input["file_path"] ?? input["pattern"] ?? input["description"] ?? "";
            onProgress({ kind: "tool", message: `${block.name} ${detail}`.trim() });
          }
        }
      }
    };
  }
  /** Pass 1 — discover areas + feature inventory; writes overview.md and _inventory.json. */
  async runInventory(model, onProgress, signal) {
    if (!await this.git.isRepo()) {
      return fail("ANALYSIS_FAILED", "Not a git repository \u2014 features init needs git for staleness tracking.");
    }
    const sha = await this.git.headSha();
    if (!sha.ok) return sha;
    const featureDirResult = await this.fs.ensureDir(ANALYSIS_FEATURES_DIR);
    if (!featureDirResult.ok) return featureDirResult;
    const skillDirResult = await this.fs.ensureDir(SKILLS_DIR);
    if (!skillDirResult.ok) return skillDirResult;
    const fileCount = await this.git.trackedFileCount() ?? 0;
    const hasCodegraph = await this.fs.exists(".codegraph");
    const userPrompt = [
      `Analyze the repository at the current working directory.`,
      ``,
      `Write your two deliverables to exactly these paths:`,
      `1. ${OVERVIEW_FILE}`,
      `2. ${INVENTORY_FILE}`,
      ``,
      `Use this git sha as analyzedAt: ${sha.value}`,
      ``,
      budgetHint(fileCount)
    ].join("\n");
    const run = await this.claude.execute({
      systemPromptFile: INVENTORY_PROMPT_PATH,
      userPrompt,
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress),
      appendSystemPrompt: hasCodegraph ? CODEGRAPH_ADDENDUM : void 0,
      signal
    });
    if (!run.ok) return run;
    this.trackCall(run.value);
    for (let attempt = 0; ; attempt++) {
      const problems = await this.inventoryProblems();
      if (problems.length === 0) break;
      if (attempt >= MAX_REPAIRS) {
        return fail("ANALYSIS_FAILED", `Inventory output is invalid after ${MAX_REPAIRS} repairs:
${problems.join("\n")}`);
      }
      onProgress?.({ kind: "warn", message: `Inventory has ${problems.length} validation problem(s) \u2014 repairing\u2026` });
      const repair = await this.claude.execute({
        systemPromptFile: INVENTORY_PROMPT_PATH,
        userPrompt: [
          `Your previous output in ${OVERVIEW_FILE} and ${INVENTORY_FILE} has validation errors.`,
          `Fix the files in place. Errors:`,
          ...problems.map((p2) => `- ${p2}`)
        ].join("\n"),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress),
        signal
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }
    return this.readInventory();
  }
  /** Pass 2 — deep-dive one feature; writes features/<id>.md with a validate→repair loop. */
  async runDeepDive(entry, model, onProgress) {
    const sha = await this.git.headSha();
    if (!sha.ok) return sha;
    const filePath = `${ANALYSIS_FEATURES_DIR}/${entry.id}.md`;
    const baseLines = [
      `Deep-dive the feature "${entry.name}" (id: ${entry.id}) of this repository.`,
      `It belongs to area "${entry.area}". Its one-line summary from the inventory:`,
      `"${entry.summary}"`,
      ``,
      `Write the knowledge file to exactly this path: ${filePath}`,
      `Use this git sha for analyzedAt and every ref's sha field: ${sha.value}`,
      ``,
      `Feature ids that exist (for the related list): see ${INVENTORY_FILE}.`
    ];
    const run = await this.claude.execute({
      systemPromptFile: DEEPDIVE_PROMPT_PATH,
      userPrompt: baseLines.join("\n"),
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress)
    });
    if (!run.ok) return run;
    this.trackCall(run.value);
    for (let attempt = 0; ; attempt++) {
      const problems = await this.featureProblems(filePath, entry);
      if (problems.length === 0) return ok(void 0);
      if (attempt >= MAX_REPAIRS) {
        return fail(
          "ANALYSIS_FAILED",
          `features/${entry.id}.md is invalid after ${MAX_REPAIRS} repairs:
${problems.map((i) => `- ${i.code}: ${i.message}`).join("\n")}`
        );
      }
      onProgress?.({ kind: "warn", message: `${entry.id} has ${problems.length} validation problem(s) \u2014 repairing\u2026` });
      const repair = await this.claude.execute({
        systemPromptFile: DEEPDIVE_PROMPT_PATH,
        userPrompt: [
          `Your previous output at ${filePath} has validation errors. Fix the file in place,`,
          `keeping the format rules exactly. Errors:`,
          ...problems.map((i) => `- ${i.code}: ${i.message}${i.line !== void 0 ? ` (line ${i.line})` : ""}`)
        ].join("\n"),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress)
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }
  }
  /** Generate the implementation skill paired with one feature knowledge file. */
  async runFeatureSkill(entry, model, onProgress) {
    const featureFile = `${ANALYSIS_FEATURES_DIR}/${entry.id}.md`;
    const skillFile = `${SKILLS_DIR}/${entry.id}.md`;
    const userPrompt = [
      `Create an implementation skill for the feature "${entry.name}" (id: ${entry.id}).`,
      `Read the feature knowledge file at exactly this path: ${featureFile}`,
      `Write the skill file to exactly this path: ${skillFile}`,
      `The skill must tell future agents to use the knowledge file first and avoid broad repo investigation.`
    ].join("\n");
    const run = await this.claude.execute({
      systemPromptFile: FEATURE_SKILL_PROMPT_PATH,
      userPrompt,
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress)
    });
    if (!run.ok) return run;
    this.trackCall(run.value);
    for (let attempt = 0; ; attempt++) {
      const problems = await this.skillProblems(skillFile, featureFile);
      if (problems.length === 0) return ok(void 0);
      if (attempt >= MAX_REPAIRS) {
        return fail("ANALYSIS_FAILED", `${skillFile} is invalid after ${MAX_REPAIRS} repairs:
${problems.join("\n")}`);
      }
      onProgress?.({ kind: "warn", message: `${entry.id} skill has ${problems.length} validation problem(s) \u2014 repairing\u2026` });
      const repair = await this.claude.execute({
        systemPromptFile: FEATURE_SKILL_PROMPT_PATH,
        userPrompt: [`Your previous output at ${skillFile} has validation errors. Fix the file in place.`, ...problems.map((p2) => `- ${p2}`)].join("\n"),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress)
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }
  }
  /** Combined pass — deep-dive + skill in one Claude call; writes features/<id>.md and skills/<id>.md. */
  async runCombinedFeature(entry, model, onProgress, signal) {
    const sha = await this.git.headSha();
    if (!sha.ok) return sha;
    const hasCodegraph = await this.fs.exists(".codegraph");
    const featureFile = `${ANALYSIS_FEATURES_DIR}/${entry.id}.md`;
    const skillFile = `${SKILLS_DIR}/${entry.id}.md`;
    const userPrompt = [
      `Deep-dive the feature "${entry.name}" (id: ${entry.id}) of this repository.`,
      `It belongs to area "${entry.area}". Its one-line summary from the inventory:`,
      `"${entry.summary}"`,
      ``,
      `Write the feature knowledge file to exactly: ${featureFile}`,
      `Write the implementation skill to exactly: ${skillFile}`,
      `Use this git sha for analyzedAt and every ref's sha field: ${sha.value}`,
      ``,
      `Feature ids that exist (for the related list): see ${INVENTORY_FILE}.`
    ].join("\n");
    const run = await this.claude.execute({
      systemPromptFile: COMBINED_PROMPT_PATH,
      userPrompt,
      model,
      print: true,
      cwd: this.fs.root,
      onEvent: this.claudeObserver(onProgress),
      appendSystemPrompt: hasCodegraph ? CODEGRAPH_ADDENDUM : void 0,
      signal
    });
    if (!run.ok) return run;
    this.trackCall(run.value);
    for (let attempt = 0; ; attempt++) {
      const featureIssues = await this.featureProblems(featureFile, entry);
      const skillIssues = await this.skillProblems(skillFile, featureFile);
      if (featureIssues.length === 0 && skillIssues.length === 0) return ok(void 0);
      const allProblems = [
        ...featureIssues.map((i) => `${featureFile}: ${i.code}: ${i.message}${i.line !== void 0 ? ` (line ${i.line})` : ""}`),
        ...skillIssues.map((p2) => `${skillFile}: ${p2}`)
      ];
      if (attempt >= MAX_REPAIRS) {
        return fail("ANALYSIS_FAILED", `${entry.id} is invalid after ${MAX_REPAIRS} repairs:
${allProblems.map((p2) => `- ${p2}`).join("\n")}`);
      }
      onProgress?.({ kind: "warn", message: `${entry.id} has ${allProblems.length} validation problem(s) \u2014 repairing\u2026` });
      const repair = await this.claude.execute({
        systemPromptFile: COMBINED_PROMPT_PATH,
        userPrompt: [
          `Your previous output has validation errors. Fix BOTH files in place. Errors:`,
          ...allProblems.map((p2) => `- ${p2}`)
        ].join("\n"),
        model,
        print: true,
        cwd: this.fs.root,
        onEvent: this.claudeObserver(onProgress),
        signal
      });
      if (!repair.ok) return repair;
      this.trackCall(repair.value, true);
    }
  }
  async readInventory() {
    const raw = await this.fs.readText(INVENTORY_FILE);
    if (!raw.ok) return fail("ANALYSIS_FAILED", "No inventory found \u2014 run `features init` first.");
    try {
      const parsed2 = InventorySchema.safeParse(JSON.parse(raw.value));
      if (!parsed2.success) {
        return fail("ANALYSIS_FAILED", `_inventory.json does not match the schema: ${parsed2.error.message}`);
      }
      return ok(parsed2.data);
    } catch (e) {
      return fail("ANALYSIS_FAILED", `_inventory.json is not valid JSON: ${e.message}`, e);
    }
  }
  /** Get ref paths from an existing feature file (for cache invalidation). Returns empty if file is missing or invalid. */
  async featureRefPaths(featureId) {
    const source = await this.fs.readText(`${ANALYSIS_FEATURES_DIR}/${featureId}.md`);
    if (!source.ok) return [];
    const result = parseFeature(source.value);
    if (!result.ok) return [];
    return result.doc.refs.map((r) => r.path);
  }
  /** Spec problems in the pass-1 outputs (empty array = valid). */
  async inventoryProblems() {
    const problems = [];
    const overviewSource = await this.fs.readText(OVERVIEW_FILE);
    let areaIds = /* @__PURE__ */ new Set();
    if (!overviewSource.ok) {
      problems.push(`${OVERVIEW_FILE} was not written`);
    } else {
      const overview = parseOverview(overviewSource.value);
      if (!overview.ok) {
        problems.push(...overview.issues.map((i) => `${OVERVIEW_FILE}: ${i.code}: ${i.message}`));
      } else {
        areaIds = new Set(overview.doc.areas.map((a) => a.id));
      }
    }
    const inventory = await this.readInventory();
    if (!inventory.ok) {
      problems.push(inventory.error.message);
    } else if (areaIds.size > 0) {
      const seen = /* @__PURE__ */ new Set();
      for (const entry of inventory.value) {
        if (!areaIds.has(entry.area)) {
          problems.push(`_inventory.json: feature "${entry.id}" references unknown area "${entry.area}"`);
        }
        if (seen.has(entry.id)) problems.push(`_inventory.json: duplicate feature id "${entry.id}"`);
        seen.add(entry.id);
      }
    }
    return problems;
  }
  async skillProblems(skillFile, featureFile) {
    const problems = [];
    if (!await this.fs.exists(featureFile)) problems.push(`${featureFile} was not written`);
    const source = await this.fs.readText(skillFile);
    if (!source.ok) return [`${skillFile} was not written`];
    if (!source.value.includes(featureFile)) problems.push(`skill must reference knowledge file ${featureFile}`);
    if (!/Do NOT (explore|scan|investigate)|avoid broad repo investigation/i.test(source.value)) {
      problems.push("skill must explicitly forbid broad repo investigation");
    }
    if (!/Knowledge Sync|update.*knowledge|update.*feature/i.test(source.value)) {
      problems.push("skill must include a final knowledge-sync/update step");
    }
    return problems;
  }
  /** Spec problems in a pass-2 output (empty array = valid). */
  async featureProblems(filePath, entry) {
    const source = await this.fs.readText(filePath);
    if (!source.ok) return [{ code: "missing-file", message: `${filePath} was not written` }];
    const result = parseFeature(source.value);
    if (!result.ok) return [...result.issues];
    const problems = [];
    if (result.doc.frontmatter.id !== entry.id) {
      problems.push({ code: "id-mismatch", message: `frontmatter id must be "${entry.id}"` });
    }
    if (result.doc.frontmatter.area !== entry.area) {
      problems.push({ code: "area-mismatch", message: `frontmatter area must be "${entry.area}"` });
    }
    for (const ref of result.doc.refs) {
      if (!await this.fs.exists(ref.path)) {
        problems.push({ code: "ref-file-missing", message: `ref path "${ref.path}" does not exist in the repo` });
      }
    }
    return problems;
  }
};

// src/services/validate.service.ts
var ValidateService = class {
  constructor(fs2) {
    this.fs = fs2;
  }
  fs;
  /** List feature md files (repo-relative paths), excluding underscore-prefixed artifacts. */
  async listFeatureFiles() {
    const entries = await this.fs.listDir(ANALYSIS_FEATURES_DIR);
    if (!entries.ok) return entries;
    return ok(
      entries.value.filter((name) => name.endsWith(".md") && !name.startsWith("_")).sort().map((name) => `${ANALYSIS_FEATURES_DIR}/${name}`)
    );
  }
  /**
   * Parse and validate the whole .features/ directory.
   * Returns the parsed project, or every issue found (grouped by file).
   */
  async validateAll() {
    const allIssues = [];
    if (!await this.fs.exists(OVERVIEW_FILE)) {
      return fail22([{ file: OVERVIEW_FILE, issues: [issue("not-initialized", "overview.md not found \u2014 run `features init` first")] }]);
    }
    const overviewSource = await this.fs.readText(OVERVIEW_FILE);
    if (!overviewSource.ok) {
      return fail22([{ file: OVERVIEW_FILE, issues: [issue("read-error", overviewSource.error.message)] }]);
    }
    const overviewResult = parseOverview(overviewSource.value);
    if (!overviewResult.ok) {
      allIssues.push({ file: OVERVIEW_FILE, issues: overviewResult.issues });
    }
    const fileList = await this.listFeatureFiles();
    const features = /* @__PURE__ */ new Map();
    if (fileList.ok) {
      for (const file of fileList.value) {
        const source = await this.fs.readText(file);
        if (!source.ok) {
          allIssues.push({ file, issues: [issue("read-error", source.error.message)] });
          continue;
        }
        const result = parseFeature(source.value);
        if (!result.ok) {
          allIssues.push({ file, issues: result.issues });
          continue;
        }
        const expectedId = file.split("/").pop().replace(/\.md$/, "");
        if (result.doc.frontmatter.id !== expectedId) {
          allIssues.push({
            file,
            issues: [issue("id-mismatch", `Frontmatter id "${result.doc.frontmatter.id}" must equal filename "${expectedId}"`)]
          });
          continue;
        }
        features.set(file, result.doc);
      }
    }
    if (!overviewResult.ok || allIssues.length > 0) {
      return fail22(allIssues);
    }
    const projectIssues = validateProject(overviewResult.doc, [...features.values()]);
    return ok({ overview: overviewResult.doc, features, projectIssues });
  }
};
function fail22(issues) {
  return { ok: false, error: issues };
}

// src/verify/languages.ts
import { createRequire } from "module";
import { dirname as dirname2, extname, join as join8 } from "path";
var require2 = createRequire(import.meta.url);
var EXTENSION_MAP = {
  ".ts": { grammar: "typescript", tag: "ts" },
  ".mts": { grammar: "typescript", tag: "ts" },
  ".cts": { grammar: "typescript", tag: "ts" },
  ".tsx": { grammar: "tsx", tag: "tsx" },
  ".js": { grammar: "javascript", tag: "js" },
  ".mjs": { grammar: "javascript", tag: "js" },
  ".cjs": { grammar: "javascript", tag: "js" },
  ".jsx": { grammar: "javascript", tag: "jsx" },
  ".py": { grammar: "python", tag: "python" },
  ".go": { grammar: "go", tag: "go" },
  ".rs": { grammar: "rust", tag: "rust" },
  ".java": { grammar: "java", tag: "java" },
  ".rb": { grammar: "ruby", tag: "ruby" },
  ".php": { grammar: "php", tag: "php" },
  ".cs": { grammar: "c_sharp", tag: "csharp" },
  ".c": { grammar: "c", tag: "c" },
  ".h": { grammar: "c", tag: "c" },
  ".cpp": { grammar: "cpp", tag: "cpp" },
  ".hpp": { grammar: "cpp", tag: "cpp" },
  ".swift": { grammar: "swift", tag: "swift" },
  ".kt": { grammar: "kotlin", tag: "kotlin" },
  ".scala": { grammar: "scala", tag: "scala" },
  ".lua": { grammar: "lua", tag: "lua" }
};
var TAG_ONLY = {
  ".css": "css",
  ".scss": "css",
  ".html": "html",
  ".json": "json",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".md": "md",
  ".sh": "bash",
  ".sql": "sql",
  ".vue": "vue",
  ".svelte": "svelte"
};
function grammarFor(path) {
  return EXTENSION_MAP[extname(path).toLowerCase()]?.grammar;
}
function langTagFor(path) {
  const ext = extname(path).toLowerCase();
  return EXTENSION_MAP[ext]?.tag ?? TAG_ONLY[ext] ?? ext.replace(/^\./, "");
}
function wasmPathFor(grammar) {
  const pkgDir = dirname2(require2.resolve("tree-sitter-wasms/package.json"));
  return join8(pkgDir, "out", `tree-sitter-${grammar}.wasm`);
}

// src/verify/symbol-resolver.ts
import Parser from "web-tree-sitter";
var initialized = false;
var languageCache = /* @__PURE__ */ new Map();
async function loadLanguage(grammar) {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
  const cached = languageCache.get(grammar);
  if (cached) return cached;
  try {
    const lang = await Parser.Language.load(wasmPathFor(grammar));
    languageCache.set(grammar, lang);
    return lang;
  } catch {
    return void 0;
  }
}
async function collectDeclarations(source, path) {
  const grammar = grammarFor(path);
  if (!grammar) return void 0;
  const lang = await loadLanguage(grammar);
  if (!lang) return void 0;
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  const declarations = [];
  const stack = [{ node: tree.rootNode, ancestry: [] }];
  while (stack.length > 0) {
    const { node, ancestry } = stack.pop();
    const nameNode = node.childForFieldName("name");
    let childAncestry = ancestry;
    if (nameNode && nameNode.text) {
      declarations.push({
        name: nameNode.text,
        ancestry,
        range: { start: node.startPosition.row + 1, end: node.endPosition.row + 1 }
      });
      childAncestry = [...ancestry, nameNode.text];
    }
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const child = node.namedChild(i);
      if (child) stack.push({ node: child, ancestry: childAncestry });
    }
  }
  tree.delete();
  parser.delete();
  return declarations;
}
function splitSymbol(symbol) {
  return symbol.split(/::|\.|#/).filter(Boolean);
}
function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}
function matchSymbol(declarations, symbol, authoredRange) {
  const parts = splitSymbol(symbol);
  const target = parts[parts.length - 1];
  if (!target) return void 0;
  const qualifiers = parts.slice(0, -1);
  const candidates = declarations.filter((d) => d.name === target);
  if (candidates.length === 0) return void 0;
  const scored = candidates.map((d) => {
    let score = 0;
    if (qualifiers.length > 0 && qualifiers.every((q) => d.ancestry.includes(q))) score += 10;
    if (authoredRange && rangesOverlap(d.range, authoredRange)) score += 5;
    return { d, score };
  });
  scored.sort((a, b) => b.score - a.score || a.d.range.start - b.d.range.start);
  return scored[0].d;
}

// src/verify/verifier.ts
function clamp(range, totalLines) {
  const start = Math.min(Math.max(1, range.start), totalLines);
  const end = Math.min(Math.max(start, range.end), totalLines);
  return { start, end };
}
function within(inner, outer) {
  return inner.start >= outer.start && inner.end <= outer.end;
}
function stillAccurate(authored, decl) {
  return within(authored, decl) || within(decl, authored);
}
function grepLines(sourceLines, symbol) {
  const parts = splitSymbol(symbol);
  const target = parts[parts.length - 1];
  if (!target) return [];
  const pattern = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const hits = [];
  for (let i = 0; i < sourceLines.length; i++) {
    if (pattern.test(sourceLines[i])) hits.push(i + 1);
  }
  return hits;
}
async function verifyRef(source, ref) {
  const sourceLines = source.split("\n");
  const totalLines = sourceLines.length;
  const authored = ref.lines;
  if (authored.start > totalLines) {
    return {
      lines: clamp(authored, totalLines),
      provenance: "stale",
      verifiedBy: "none",
      healed: false,
      stale: true,
      staleReason: "lines-out-of-range"
    };
  }
  if (!ref.symbol) {
    return {
      lines: clamp(authored, totalLines),
      provenance: "unverified",
      verifiedBy: "none",
      healed: false,
      stale: false
    };
  }
  const declarations = await collectDeclarations(source, ref.path);
  if (declarations) {
    const match = matchSymbol(declarations, ref.symbol, authored);
    if (match) {
      if (stillAccurate(authored, match.range)) {
        return {
          lines: clamp(authored, totalLines),
          provenance: "verified",
          verifiedBy: "tree-sitter",
          healed: false,
          stale: false
        };
      }
      return {
        lines: match.range,
        provenance: "healed",
        verifiedBy: "tree-sitter",
        healed: true,
        stale: false
      };
    }
  }
  const hits = grepLines(sourceLines, ref.symbol);
  if (hits.length > 0) {
    const inRange = hits.some((line) => line >= authored.start && line <= authored.end);
    if (inRange) {
      return {
        lines: clamp(authored, totalLines),
        provenance: "verified",
        verifiedBy: "grep",
        healed: false,
        stale: false
      };
    }
    const span = authored.end - authored.start;
    const start = hits[0];
    return {
      lines: clamp({ start, end: start + span }, totalLines),
      provenance: "healed",
      verifiedBy: "grep",
      healed: true,
      stale: false
    };
  }
  return {
    lines: clamp(authored, totalLines),
    provenance: "stale",
    verifiedBy: "none",
    healed: false,
    stale: true,
    staleReason: "symbol-not-found"
  };
}
function extractSnippet(source, lines) {
  return source.split("\n").slice(lines.start - 1, lines.end).join("\n");
}

// src/services/compile.service.ts
var CompileService = class {
  constructor(fs2, git, validateService2) {
    this.fs = fs2;
    this.git = git;
    this.validateService = validateService2;
  }
  fs;
  git;
  validateService;
  /**
   * md → manifest.json. Pure Node (no AI): parse + validate, verify/heal every code
   * reference against the live repo, extract snippets, compute staleness and stats.
   */
  async compile() {
    const project = await this.validateService.validateAll();
    if (!project.ok) return project;
    const { overview, features, projectIssues } = project.value;
    const { errors, warnings } = splitIssues(projectIssues);
    if (errors.length > 0) {
      return { ok: false, error: [{ file: `${ANALYSIS_DIR}/`, issues: errors }] };
    }
    const changedSince = /* @__PURE__ */ new Map();
    for (const doc of features.values()) {
      const sha = doc.frontmatter.analyzedAt;
      if (sha && !changedSince.has(sha)) {
        const changed = await this.git.changedFilesSince(sha);
        changedSince.set(sha, new Set(changed.ok ? changed.value : []));
      }
    }
    const counters = { refs: 0, verified: 0, healed: 0, unverified: 0, stale: 0 };
    const staleFeatures = [];
    const manifestFeatures = [];
    for (const doc of features.values()) {
      const refs = [];
      for (const ref of doc.refs) {
        refs.push(await this.compileRef(ref, counters));
      }
      const changed = doc.frontmatter.analyzedAt ? changedSince.get(doc.frontmatter.analyzedAt) : void 0;
      const featureStale = changed !== void 0 && doc.refs.some((r) => changed.has(r.path)) || refs.some((r) => r.stale);
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
        featureStale
      });
    }
    const fileCount = await this.git.trackedFileCount() ?? 0;
    const manifest = {
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
          lastAnalyzed: (/* @__PURE__ */ new Date()).toISOString()
        }
      },
      areas: overview.areas,
      features: manifestFeatures
    };
    const parsed2 = ManifestSchema.safeParse(manifest);
    if (!parsed2.success) {
      return fail23(`Internal error: compiled manifest failed schema validation: ${parsed2.error.message}`);
    }
    const writeResult = await this.fs.writeText(MANIFEST_FILE, JSON.stringify(parsed2.data, null, 2));
    if (!writeResult.ok) return fail23(writeResult.error.message);
    return ok({
      features: manifestFeatures.length,
      ...counters,
      staleFeatures,
      warnings: warnings.length > 0 ? [{ file: `${ANALYSIS_DIR}/`, issues: warnings }] : [],
      manifestPath: this.fs.resolve(MANIFEST_FILE)
    });
  }
  async compileRef(ref, counters) {
    counters.refs++;
    const lang = langTagFor(ref.path);
    const base = { path: ref.path, lang, what: ref.what, annotation: ref.note, symbol: ref.symbol };
    const source = await this.fs.readText(ref.path);
    if (!source.ok) {
      counters.stale++;
      return {
        ...base,
        lines: ref.lines,
        code: "",
        provenance: "stale",
        verifiedBy: "none",
        healed: false,
        stale: true,
        staleReason: "file-missing"
      };
    }
    const outcome = await verifyRef(source.value, ref);
    counters[outcome.provenance === "verified" ? "verified" : outcome.provenance === "healed" ? "healed" : outcome.provenance === "stale" ? "stale" : "unverified"]++;
    return {
      ...base,
      lines: outcome.lines,
      code: extractSnippet(source.value, outcome.lines),
      provenance: outcome.provenance,
      verifiedBy: outcome.verifiedBy,
      healed: outcome.healed,
      stale: outcome.stale,
      staleReason: outcome.staleReason
    };
  }
};
function fail23(message) {
  return { ok: false, error: message };
}

// src/services/serve.service.ts
import { createReadStream, existsSync as existsSync2, statSync } from "fs";
import { createServer } from "http";
import { extname as extname2, join as join9, normalize } from "path";
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json"
};
var ServeService = class {
  constructor(fs2, viewerDistDir) {
    this.fs = fs2;
    this.viewerDistDir = viewerDistDir;
  }
  fs;
  viewerDistDir;
  /** Serve the bundled viewer + the repo's manifest.json on the given port. */
  start(port) {
    if (!existsSync2(join9(this.viewerDistDir, "index.html"))) {
      return fail(
        "SERVER_ERROR",
        `Viewer assets not found at ${this.viewerDistDir}. Reinstall features CLI.`
      );
    }
    if (!this.fs.existsSync(MANIFEST_FILE)) {
      return fail("SERVER_ERROR", "manifest.json not found \u2014 run `features init` first.");
    }
    const server = createServer((req, res) => this.handle(req, res));
    server.listen(port);
    return ok(server);
  }
  handle(req, res) {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/manifest.json") {
      this.sendFile(res, this.fs.resolve(MANIFEST_FILE));
      return;
    }
    const safePath = normalize(url).replace(/^(\.\.[/\\])+/, "");
    const assetPath = join9(this.viewerDistDir, safePath === "/" ? "index.html" : safePath);
    if (assetPath.startsWith(this.viewerDistDir) && existsSync2(assetPath) && statSync(assetPath).isFile()) {
      this.sendFile(res, assetPath);
      return;
    }
    this.sendFile(res, join9(this.viewerDistDir, "index.html"));
  }
  sendFile(res, path) {
    res.setHeader("Content-Type", MIME[extname2(path)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    createReadStream(path).on("error", () => {
      res.statusCode = 404;
      res.end("Not found");
    }).pipe(res);
  }
};

// src/services/live-server.service.ts
import { existsSync as existsSync3 } from "fs";
import { join as join10 } from "path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
var LiveServerService = class {
  constructor(fs2, analyzeService2, compileService2, viewerDistDir) {
    this.fs = fs2;
    this.analyzeService = analyzeService2;
    this.compileService = compileService2;
    this.viewerDistDir = viewerDistDir;
  }
  fs;
  analyzeService;
  compileService;
  viewerDistDir;
  listeners = /* @__PURE__ */ new Set();
  running = false;
  runId = 0;
  log = [];
  start(port, model) {
    if (!existsSync3(join10(this.viewerDistDir, "index.html"))) {
      return fail("SERVER_ERROR", `Viewer assets not found at ${this.viewerDistDir}.`);
    }
    const app = new Hono();
    app.get("/manifest.json", async (c) => {
      const manifest = await this.fs.readText(MANIFEST_FILE);
      if (!manifest.ok) return c.json({ error: "No manifest \u2014 run an analysis first." }, 404);
      return c.body(manifest.value, 200, { "Content-Type": "application/json" });
    });
    app.get(
      "/api/status",
      (c) => c.json({ live: true, analyzing: this.running, runId: this.runId, hasManifest: this.fs.existsSync(MANIFEST_FILE) })
    );
    app.post("/api/analyze", async (c) => {
      if (this.running) return c.json({ error: "An analysis is already running.", runId: this.runId }, 409);
      const body = await c.req.json().catch(() => ({}));
      this.runId += 1;
      this.log = [];
      void this.runAnalysis(model, body.feature);
      return c.json({ runId: this.runId });
    });
    app.get(
      "/api/analyze/events",
      (c) => streamSSE(c, async (stream) => {
        for (const event of this.log) {
          await stream.writeSSE({ event: event.kind, data: JSON.stringify(event) });
        }
        const listener = (event) => {
          void stream.writeSSE({ event: event.kind, data: JSON.stringify(event) });
        };
        this.listeners.add(listener);
        stream.onAbort(() => {
          this.listeners.delete(listener);
        });
        await new Promise((resolve3) => stream.onAbort(resolve3));
      })
    );
    app.use("/*", serveStatic({ root: this.viewerDistDir }));
    app.notFound(async (c) => {
      const index = await this.fs.readText(join10(this.viewerDistDir, "index.html"));
      return index.ok ? c.html(index.value) : c.text("Not found", 404);
    });
    return ok(serve({ fetch: app.fetch, port }));
  }
  emit(event) {
    const live = { ...event, runId: this.runId };
    this.log.push(live);
    for (const listener of this.listeners) listener(live);
  }
  async runAnalysis(model, featureId) {
    this.running = true;
    const onProgress = (e) => this.emit(e);
    try {
      let inventory;
      if (featureId) {
        const existing = await this.analyzeService.readInventory();
        if (!existing.ok) return this.emit({ kind: "error", message: existing.error.message });
        const entry = existing.value.find((e) => e.id === featureId);
        if (!entry) return this.emit({ kind: "error", message: `Unknown feature "${featureId}".` });
        inventory = [entry];
      } else {
        this.emit({ kind: "phase", message: "Pass 1/2 \u2014 discovering areas and features\u2026" });
        const result = await this.analyzeService.runInventory(model, onProgress);
        if (!result.ok) return this.emit({ kind: "error", message: result.error.message });
        inventory = result.value;
        this.emit({ kind: "phase", message: `Inventory: ${inventory.length} feature(s).` });
      }
      for (let i = 0; i < inventory.length; i++) {
        const entry = inventory[i];
        this.emit({ kind: "phase", message: `Pass 2/2 \u2014 [${i + 1}/${inventory.length}] ${entry.name}\u2026` });
        const result = await this.analyzeService.runDeepDive(entry, model, onProgress);
        if (!result.ok) this.emit({ kind: "warn", message: `${entry.id}: ${result.error.message}` });
      }
      this.emit({ kind: "phase", message: "Compiling manifest\u2026" });
      const compiled = await this.compileService.compile();
      if (!compiled.ok) {
        return this.emit({
          kind: "error",
          message: typeof compiled.error === "string" ? compiled.error : "Compile failed \u2014 spec violations."
        });
      }
      const s = compiled.value;
      this.emit({
        kind: "done",
        message: `Compiled ${s.features} feature(s) \u2014 ${s.verified} verified, ${s.healed} healed, ${s.stale} stale.`
      });
    } finally {
      this.running = false;
    }
  }
};

// src/commands/create.ts
import { join as join11 } from "path";
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
function showSuccess(message) {
  p.log.success(chalk.green(message));
}
function showWarn(message) {
  p.log.warn(chalk.yellow(message));
}
function showInfo(message) {
  p.log.info(message);
}
function createProgressBar(total) {
  const BAR_WIDTH = 20;
  let current = 0;
  function render(label) {
    const pct = total > 0 ? current / total : 0;
    const filled = Math.round(pct * BAR_WIDTH);
    const bar = chalk.hex("#7B68EE")("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(BAR_WIDTH - filled));
    const counter = chalk.dim(`${current}/${total}`);
    process.stdout.write(`\r\x1B[K  ${bar} ${counter} ${label}`);
  }
  return {
    update(label) {
      current++;
      render(label);
    },
    skip(label) {
      current++;
      render(chalk.dim(label));
    },
    done() {
      process.stdout.write("\n");
    }
  };
}
function showAnalyzeIntro(label) {
  console.log(BANNER);
  p.intro(chalk.hex("#7B68EE")(`features ${label}`));
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
    showFeatureFolder(join11(".features", featureName));
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
    const skillDir = join11(".features", featureName, "skill");
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
import { join as join12 } from "path";
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
    const kbPath = join12(".features", featureName, "kb", "KNOWLEDGE.md");
    const legacyKbPath = join12(".features", featureName, "kb", "knowledge.md");
    const legacyKbPath2 = join12(".features", featureName, "knowledge", "knowledge.md");
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
import { join as join13 } from "path";
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
        const skillDir = join13(".features", selected.name, "skill");
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

// src/commands/init.ts
import { readFile as readFile3 } from "fs/promises";
import { createInterface as createInterface3 } from "readline";

// src/lib/cache.ts
import { createHash } from "crypto";
import { rename, readFile as readFile2, writeFile as writeFile3 } from "fs/promises";
import { resolve as resolve2 } from "path";
var CACHE_VERSION = 1;
var CACHE_FILE = `${ANALYSIS_DIR}/.cache.json`;
function sha256(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
function hashInventoryEntry(entry) {
  return sha256(`${entry.id}|${entry.area}|${entry.name}|${entry.summary}`);
}
var AnalysisCache = class _AnalysisCache {
  constructor(rootDir, promptHash, data) {
    this.rootDir = rootDir;
    this.promptHash = promptHash;
    if (data && data.version === CACHE_VERSION && data.promptHash === promptHash) {
      this.data = data;
    } else {
      this.data = { version: CACHE_VERSION, promptHash, features: {} };
    }
  }
  rootDir;
  promptHash;
  data;
  dirty = false;
  static async load(rootDir, promptContent) {
    const promptHash = sha256(promptContent);
    const filePath = resolve2(rootDir, CACHE_FILE);
    try {
      const raw = await readFile2(filePath, "utf-8");
      const parsed2 = JSON.parse(raw);
      return new _AnalysisCache(rootDir, promptHash, parsed2);
    } catch {
      return new _AnalysisCache(rootDir, promptHash, null);
    }
  }
  isValid(entry, changedFiles, featureRefPaths) {
    const cached = this.data.features[entry.id];
    if (!cached) return false;
    if (cached.inventoryHash !== hashInventoryEntry(entry)) return false;
    for (const refPath of featureRefPaths) {
      if (changedFiles.has(refPath)) return false;
    }
    return true;
  }
  update(entry, analyzedAt) {
    this.data = {
      ...this.data,
      features: {
        ...this.data.features,
        [entry.id]: {
          inventoryHash: hashInventoryEntry(entry),
          analyzedAt,
          lastAnalyzedMs: Date.now()
        }
      }
    };
    this.dirty = true;
  }
  async save() {
    if (!this.dirty) return;
    const filePath = resolve2(this.rootDir, CACHE_FILE);
    const tmpPath = `${filePath}.tmp`;
    await writeFile3(tmpPath, JSON.stringify(this.data, null, 2), "utf-8");
    await rename(tmpPath, filePath);
    this.dirty = false;
  }
};

// src/lib/concurrency.ts
async function mapWithConcurrency(items, concurrency, fn, signal) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      if (signal?.aborted) return;
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// src/commands/init.ts
var QUIET = () => {
};
function formatStats(stats, featureCount, skippedCount) {
  const analyzed = featureCount - skippedCount;
  const parts = [];
  parts.push(`Features: ${featureCount}${skippedCount > 0 ? ` (${skippedCount} cached, ${analyzed} analyzed)` : ""}`);
  parts.push(`Claude calls: ${stats.callCount}${stats.repairCount > 0 ? ` (${stats.repairCount} repairs)` : ""}`);
  if (stats.totalInputTokens > 0 || stats.totalOutputTokens > 0) {
    const fmt = (n) => n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;
    const tokens = [`${fmt(stats.totalInputTokens)} in`, `${fmt(stats.totalOutputTokens)} out`];
    if (stats.totalCacheReadTokens > 0) tokens.push(`${fmt(stats.totalCacheReadTokens)} cache-read`);
    parts.push(`Tokens: ${tokens.join(" / ")}`);
  }
  if (stats.totalCostUsd > 0) {
    parts.push(`Cost: $${stats.totalCostUsd.toFixed(2)}`);
  }
  if (stats.totalDurationMs > 0) {
    const secs = Math.round(stats.totalDurationMs / 1e3);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    parts.push(`Duration: ${m > 0 ? `${m}m ${s}s` : `${s}s`}`);
  }
  return parts.join("\n  ");
}
var DEFAULT_CONCURRENCY = 4;
function waitForEnterOrExit() {
  return new Promise((resolve3) => {
    const rl = createInterface3({ input: process.stdin });
    const exitHandler = () => {
      rl.close();
      process.exit(130);
    };
    process.on("SIGINT", exitHandler);
    rl.once("line", () => {
      process.off("SIGINT", exitHandler);
      rl.close();
      resolve3();
    });
  });
}
var OLD_ANALYSIS_DIR = ".code-explain";
var MIGRATION_ITEMS = ["overview.md", "features", "skills", "manifest.json", ".cache.json"];
async function migrateFromCodeExplain(fs2) {
  const hasOld = await fs2.exists(`${OLD_ANALYSIS_DIR}/overview.md`);
  const hasNew = await fs2.exists(`${ANALYSIS_DIR}/overview.md`);
  if (!hasOld || hasNew) return;
  showInfo("Migrating analysis data from .code-explain/ to .features/\u2026");
  await fs2.ensureDir(ANALYSIS_DIR);
  for (const item of MIGRATION_ITEMS) {
    if (await fs2.exists(`${OLD_ANALYSIS_DIR}/${item}`)) {
      await fs2.copy(`${OLD_ANALYSIS_DIR}/${item}`, `${ANALYSIS_DIR}/${item}`);
    }
  }
  showSuccess("Migration complete. You can safely remove .code-explain/ when ready.");
}
function makeInitCommand(deps) {
  const { analyzeService: analyzeService2, compileService: compileService2, gitClient: gitClient2, fs: fs2, rootDir } = deps;
  return async function initCommand2(options) {
    showAnalyzeIntro("init");
    await migrateFromCodeExplain(fs2);
    const model = resolveModel(options.model, "opus");
    const useCache = options.cache !== false;
    analyzeService2.resetStats();
    let inventory;
    if (options.feature) {
      const existing = await analyzeService2.readInventory();
      if (!existing.ok) {
        showError(existing.error.message);
        process.exitCode = 1;
        return;
      }
      const entry = existing.value.find((e) => e.id === options.feature);
      if (!entry) {
        showError(`Feature "${options.feature}" is not in the inventory. Known ids: ${existing.value.map((e) => e.id).join(", ")}`);
        process.exitCode = 1;
        return;
      }
      inventory = [entry];
    } else {
      let resumed = false;
      if (useCache) {
        const existing = await analyzeService2.readInventory();
        if (existing.ok) {
          inventory = existing.value;
          resumed = true;
          showSuccess(`Resuming from previous inventory (${inventory.length} features). Use --no-cache to re-discover.`);
        }
      }
      if (!resumed) {
        while (true) {
          const ac = new AbortController();
          const sigintHandler = () => {
            ac.abort();
          };
          process.on("SIGINT", sigintHandler);
          const spin = createSpinner();
          spin.start("Pass 1/2 \u2014 discovering areas and features\u2026");
          const result = await analyzeService2.runInventory(model, QUIET, ac.signal);
          process.off("SIGINT", sigintHandler);
          if (result.ok) {
            spin.stop("Inventory complete.");
            inventory = result.value;
            showSuccess(`Inventory: ${inventory.length} feature(s) across the repo.`);
            break;
          }
          const aborted = result.error.code === "CLAUDE_ABORTED";
          spin.stop(aborted ? "Paused." : "Failed.");
          if (aborted) {
            showInfo("Press Enter to resume (Ctrl+C to exit)\u2026");
          } else {
            showWarn(`Inventory failed: ${result.error.message}`);
            showInfo("Press Enter to retry when quota resets (Ctrl+C to exit)\u2026");
          }
          await waitForEnterOrExit();
          showInfo("Retrying inventory\u2026");
        }
      }
    }
    const concurrency = Math.max(1, parseInt(options.concurrency ?? "", 10) || DEFAULT_CONCURRENCY);
    let cache = null;
    let changedFiles = null;
    if (useCache) {
      const promptContent = await readFile3(COMBINED_PROMPT_PATH, "utf-8").catch(() => "");
      cache = await AnalysisCache.load(rootDir, promptContent);
      const sha = await gitClient2.headSha();
      if (sha.ok) {
        const changed = await gitClient2.changedFilesSince(sha.value);
        changedFiles = new Set(changed.ok ? changed.value : []);
      }
    }
    showInfo(`Pass 2/2 \u2014 analyzing ${inventory.length} feature(s) with concurrency ${concurrency}\u2026`);
    const completed = /* @__PURE__ */ new Set();
    let skippedCount = 0;
    let failures = [];
    while (true) {
      const ac = new AbortController();
      let paused = false;
      const sigintHandler = () => {
        paused = true;
        ac.abort();
      };
      process.on("SIGINT", sigintHandler);
      failures = [];
      let iterationSkipped = 0;
      const progress = createProgressBar(inventory.length);
      await mapWithConcurrency(inventory, concurrency, async (entry) => {
        if (completed.has(entry.id)) {
          progress.skip(`${entry.id} (cached)`);
          iterationSkipped++;
          return;
        }
        if (cache && changedFiles) {
          const refPaths = await analyzeService2.featureRefPaths(entry.id);
          if (refPaths.length > 0 && cache.isValid(entry, changedFiles, refPaths)) {
            progress.skip(`${entry.id} (cached)`);
            completed.add(entry.id);
            iterationSkipped++;
            return;
          }
        }
        progress.update(entry.name);
        const result = await analyzeService2.runCombinedFeature(entry, model, QUIET, ac.signal);
        if (!result.ok) {
          if (!paused) failures.push(entry.id);
          return;
        }
        completed.add(entry.id);
        if (cache) {
          const sha = await gitClient2.headSha();
          if (sha.ok) cache.update(entry, sha.value);
          await cache.save().catch(() => {
          });
        }
      }, ac.signal);
      process.off("SIGINT", sigintHandler);
      progress.done();
      if (!paused) {
        skippedCount = iterationSkipped;
        break;
      }
      if (cache) await cache.save().catch(() => {
      });
      const remaining = inventory.length - completed.size;
      if (remaining === 0) {
        skippedCount = iterationSkipped;
        break;
      }
      showWarn(`Paused \u2014 ${completed.size}/${inventory.length} features completed.`);
      showInfo("Press Enter to resume (Ctrl+C to exit)\u2026");
      await waitForEnterOrExit();
      showInfo(`Resuming \u2014 ${remaining} feature(s) remaining\u2026`);
    }
    if (cache) await cache.save().catch(() => {
    });
    if (failures.length > 0) {
      showWarn(`${failures.length} feature(s) failed: ${failures.join(", ")}`);
    }
    if (failures.length === inventory.length) {
      showError("No feature files were produced.");
      process.exitCode = 1;
      return;
    }
    if (!options.skipCompile) {
      showInfo("Compiling manifest\u2026");
      const compiled = await compileService2.compile();
      if (!compiled.ok) {
        showError(typeof compiled.error === "string" ? compiled.error : "Compile failed \u2014 run validation for details.");
        process.exitCode = 1;
        return;
      }
      const s = compiled.value;
      showSuccess(
        `Compiled ${s.features} feature(s) \u2014 refs: ${s.verified} verified, ${s.healed} healed, ${s.stale} stale.`
      );
    }
    const stats = analyzeService2.stats;
    if (stats.callCount > 0 || skippedCount > 0) {
      showInfo(`
  ${formatStats(stats, inventory.length, skippedCount)}`);
    }
    showOutro("Analysis complete. Run `features serve` to browse it.");
  };
}

// src/commands/serve.ts
import chalk4 from "chalk";
function makeServeCommand(deps) {
  const { serveService: serveService2, liveServerService: liveServerService2 } = deps;
  return async function serveCommand2(options) {
    showAnalyzeIntro(options.live ? "serve --live" : "serve");
    const port = Number(options.port ?? DEFAULT_SERVE_PORT);
    const result = options.live ? liveServerService2.start(port, resolveModel(options.model, "sonnet")) : serveService2.start(port);
    if (!result.ok) {
      showError(result.error.message);
      process.exitCode = 1;
      return;
    }
    showInfo(`Browsing at ${chalk4.bold(`http://localhost:${port}`)} \u2014 press Ctrl-C to stop.`);
    if (options.live) showInfo("Live mode: trigger re-analysis from the UI.");
  };
}

// src/index.ts
var cwd = process.cwd();
var fs = new FilesystemRepository(cwd);
var featureRepo = new FeatureRepository(fs);
var claudeClient = new ClaudeClient();
var gitClient = new GitClient(cwd);
var editorClient = new EditorClient();
var featureService = new FeatureService(featureRepo, claudeClient);
var kbService = new KBService(fs, claudeClient);
var skillService = new SkillService(fs, claudeClient, gitClient);
var deployService = new DeployService(fs);
var analyzeService = new AnalyzeService(fs, gitClient, claudeClient);
var validateService = new ValidateService(fs);
var compileService = new CompileService(fs, gitClient, validateService);
var serveService = new ServeService(fs, VIEWER_DIST_DIR);
var liveServerService = new LiveServerService(fs, analyzeService, compileService, VIEWER_DIST_DIR);
var createCommand = makeCreateCommand({ kbService, skillService, deployService, editorClient });
var runCommand = makeRunCommand({ featureService });
var skillCommand = makeSkillCommand({ skillService, fs });
var updateCommand = makeUpdateCommand({ featureService, kbService, skillService, deployService });
var initCommand = makeInitCommand({ analyzeService, compileService, gitClient, fs, rootDir: cwd });
var serveCommand = makeServeCommand({ serveService, liveServerService });
program.name("features").description("Create AI-powered features from your codebase").version(VERSION);
program.command("run").description("Run a feature \u2014 implement with KB-powered Claude Code").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(runCommand);
program.command("create").description("Create a new feature (KB + Skill)").argument("[topic]", "What the feature should know about").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(createCommand);
program.command("skill").description("Create a skill for an existing feature (Binah phase)").argument("[feature-name]", "Name of existing feature (e.g., text-command)").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(skillCommand);
program.command("update").description("Update an existing feature's KB or skill").argument("[feature-name]", "Name of feature to update (e.g., text-command)").option("-m, --model <model>", "Claude model to use (e.g., sonnet, opus, haiku)").action(updateCommand);
program.command("init").description("Analyze the repo and generate feature knowledge for browsing").option("-m, --model <model>", "Claude model: haiku, sonnet, opus (default: opus)").option("-f, --feature <id>", "Refresh a single feature instead of the whole repo").option("-c, --concurrency <n>", "Max parallel Claude processes (default: 4)").option("--skip-compile", "Do not compile the manifest after analysis").option("--no-cache", "Skip incremental cache and re-analyze all features").action(initCommand);
program.command("serve").description("Browse feature knowledge in the web viewer").option("-p, --port <port>", "Port to listen on", String(4747)).option("--live", "Enable live mode: trigger and watch analysis from the UI").option("-m, --model <model>", "Claude model for live-mode analysis (default: sonnet)").action(serveCommand);
program.action(() => {
  program.help();
});
program.parse();
