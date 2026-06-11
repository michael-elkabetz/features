#!/usr/bin/env node
import { program } from 'commander';
import { VERSION } from './version.js';

import { FilesystemRepository } from './repositories/filesystem.repository.js';
import { FeatureRepository } from './repositories/feature.repository.js';
import { ClaudeClient } from './clients/claude.client.js';
import { GitClient } from './clients/git.client.js';
import { EditorClient } from './clients/editor.client.js';
import { FeatureService } from './services/feature.service.js';
import { KBService } from './services/kb.service.js';
import { SkillService } from './services/skill.service.js';
import { DeployService } from './services/deploy.service.js';
import { AnalyzeService } from './services/analyze.service.js';
import { ValidateService } from './services/validate.service.js';
import { CompileService } from './services/compile.service.js';
import { ServeService } from './services/serve.service.js';
import { LiveServerService } from './services/live-server.service.js';
import { VIEWER_DIST_DIR } from './lib/analysis-config.js';

import { makeCreateCommand } from './commands/create.js';
import { makeRunCommand } from './commands/run.js';
import { makeSkillCommand } from './commands/skill.js';
import { makeUpdateCommand } from './commands/update.js';
import { makeInitCommand } from './commands/init.js';
import { makeServeCommand } from './commands/serve.js';

const cwd = process.cwd();
const fs = new FilesystemRepository(cwd);
const featureRepo = new FeatureRepository(fs);
const claudeClient = new ClaudeClient();
const gitClient = new GitClient(cwd);
const editorClient = new EditorClient();

const featureService = new FeatureService(featureRepo, claudeClient);
const kbService = new KBService(fs, claudeClient);
const skillService = new SkillService(fs, claudeClient, gitClient);
const deployService = new DeployService(fs);

const analyzeService = new AnalyzeService(fs, gitClient, claudeClient);
const validateService = new ValidateService(fs);
const compileService = new CompileService(fs, gitClient, validateService);
const serveService = new ServeService(fs, VIEWER_DIST_DIR);
const liveServerService = new LiveServerService(fs, analyzeService, compileService, VIEWER_DIST_DIR);

const createCommand = makeCreateCommand({ kbService, skillService, deployService, editorClient });
const runCommand = makeRunCommand({ featureService });
const skillCommand = makeSkillCommand({ skillService, fs });
const updateCommand = makeUpdateCommand({ featureService, kbService, skillService, deployService });
const initCommand = makeInitCommand({ analyzeService, compileService, gitClient, fs, rootDir: cwd });
const serveCommand = makeServeCommand({ serveService, liveServerService });

program
  .name('features')
  .description('Create AI-powered features from your codebase')
  .version(VERSION);

program
  .command('run')
  .description("Run a feature — implement with KB-powered Claude Code")
  .option('-m, --model <model>', 'Claude model to use (e.g., sonnet, opus, haiku)')
  .action(runCommand);

program
  .command('create')
  .description('Create a new feature (KB + Skill)')
  .argument('[topic]', 'What the feature should know about')
  .option('-m, --model <model>', 'Claude model to use (e.g., sonnet, opus, haiku)')
  .action(createCommand);

program
  .command('skill')
  .description('Create a skill for an existing feature (Binah phase)')
  .argument('[feature-name]', 'Name of existing feature (e.g., text-command)')
  .option('-m, --model <model>', 'Claude model to use (e.g., sonnet, opus, haiku)')
  .action(skillCommand);

program
  .command('update')
  .description("Update an existing feature's KB or skill")
  .argument('[feature-name]', 'Name of feature to update (e.g., text-command)')
  .option('-m, --model <model>', 'Claude model to use (e.g., sonnet, opus, haiku)')
  .action(updateCommand);

program
  .command('init')
  .description('Analyze the repo and generate feature knowledge for browsing')
  .option('-m, --model <model>', 'Claude model: haiku, sonnet, opus (default: opus)')
  .option('-f, --feature <id>', 'Refresh a single feature instead of the whole repo')
  .option('-c, --concurrency <n>', 'Max parallel Claude processes (default: 4)')
  .option('--skip-compile', 'Do not compile the manifest after analysis')
  .option('--no-cache', 'Skip incremental cache and re-analyze all features')
  .action(initCommand);

program
  .command('serve')
  .description('Browse feature knowledge in the web viewer')
  .option('-p, --port <port>', 'Port to listen on', String(4747))
  .option('--live', 'Enable live mode: trigger and watch analysis from the UI')
  .option('-m, --model <model>', 'Claude model for live-mode analysis (default: sonnet)')
  .action(serveCommand);

program.action(() => { program.help(); });

program.parse();
