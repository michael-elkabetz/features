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

import { makeCreateCommand } from './commands/create.js';
import { makeRunCommand } from './commands/run.js';
import { makeSkillCommand } from './commands/skill.js';
import { makeUpdateCommand } from './commands/update.js';

const fs = new FilesystemRepository(process.cwd());
const featureRepo = new FeatureRepository(fs);
const claudeClient = new ClaudeClient();
const gitClient = new GitClient();
const editorClient = new EditorClient();

const featureService = new FeatureService(featureRepo, claudeClient);
const kbService = new KBService(fs, claudeClient);
const skillService = new SkillService(fs, claudeClient, gitClient);
const deployService = new DeployService(fs);

const createCommand = makeCreateCommand({ kbService, skillService, deployService, editorClient });
const runCommand = makeRunCommand({ featureService });
const skillCommand = makeSkillCommand({ skillService, fs });
const updateCommand = makeUpdateCommand({ featureService, kbService, skillService, deployService });

program
  .name('features')
  .description('Create AI-powered features from your codebase')
  .version(VERSION);

program
  .command('run', { isDefault: true })
  .description("Run a feature — execute with KB-powered Claude Code")
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

program.parse();
