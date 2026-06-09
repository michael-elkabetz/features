import { createInterface } from 'node:readline';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import type { Feature } from '../types/index.js';
import type { ReviewChoice, UpdateTarget } from '../types/index.js';
import { VERSION } from '../version.js';

const BANNER = `
  ${chalk.bold.hex('#C9A227')('C')}${chalk.dim.hex('#8B7355')('hochmah')}         ${chalk.bold.hex('#C9A227')('B')}${chalk.dim.hex('#8B7355')('inah')}
  ${chalk.dim('Knowledge')}        ${chalk.dim('Skills')}
          ${chalk.dim('\\')}      ${chalk.dim('/')}
           ${chalk.bold.hex('#C9A227')('D')}${chalk.dim.hex('#8B7355')("a'at")}
         ${chalk.dim('Implementation')}          ${chalk.dim(`v${VERSION}`)}
`;

export function showIntro(): void {
  console.log(BANNER);
  p.intro(chalk.hex('#7B68EE')('Step 1 — KB Creation'));
}

export function showBinahIntro(): void {
  console.log();
  p.intro(chalk.hex('#7B68EE')('Step 2: Binah — Skill Creation'));
}

export function showDaatIntro(): void {
  console.log();
  p.intro(chalk.hex('#7B68EE')("Step 3: Da'at — Deployment"));
}

export function showDaatNote(featureName: string): void {
  const command = chalk.hex('#7B68EE').bold(`/${featureName}`);
  p.log.message(
    `${chalk.hex('#7B68EE')('Invoke your new feature by typing')} ${command} ${chalk.hex('#7B68EE')('in your code agent.')}`,
  );
}

export function showOutro(message?: string): void {
  p.outro(message || chalk.green('Done.'));
}

export async function askTopic(): Promise<string | symbol> {
  return p.text({
    message: 'A brief description of the feature.',
    placeholder: 'e.g., adding a new 3rd party integration',
    validate(value) {
      if (!value.trim()) return 'Please describe the feature topic.';
    },
  });
}

export async function askFeatureName(suggested: string): Promise<string | symbol> {
  return p.text({
    message: 'Feature name?',
    initialValue: suggested || undefined,
    placeholder: suggested || 'e.g., text-command',
    validate(value) {
      if (!value.trim()) return 'Please provide a name.';
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.trim())) {
        return 'Use kebab-case (e.g., text-command, vendor-integration)';
      }
    },
  });
}

export function showFeatureFolder(path: string): void {
  p.log.info(`Feature folder: ${chalk.hex('#C9A227').bold(path)}`);
}

export function createSpinner(): ReturnType<typeof p.spinner> {
  return p.spinner();
}

export function showError(message: string): void {
  p.log.error(chalk.red(message));
}

export function showSuccess(message: string): void {
  p.log.success(chalk.green(message));
}

export function showWarn(message: string): void {
  p.log.warn(chalk.yellow(message));
}

export function showInfo(message: string): void {
  p.log.info(message);
}

export function showAnalyzeIntro(label: string): void {
  console.log(BANNER);
  p.intro(chalk.hex('#7B68EE')(`features ${label}`));
}

export function showStep(message: string): void {
  p.log.step(message);
}

export function showKbNote(kbPath: string): void {
  p.note(
    `${kbPath}\n\n${chalk.dim('Review the KB file before proceeding to skill creation.')}`,
    'KB file ready',
  );
}

export async function askKbReview(_kbPath: string): Promise<ReviewChoice | symbol> {
  return p.select({
    message: 'How would you like to proceed?',
    options: [
      { value: 'approve' as const, label: 'Approve and create skill', hint: 'proceed to Binah phase' },
      { value: 'edit' as const, label: 'Open in editor to revise', hint: '$EDITOR or vi' },
      { value: 'skip' as const, label: 'Skip skill creation for now', hint: "run 'features skill' later" },
    ],
  });
}

export function showUpdateIntro(): void {
  console.log(BANNER);
  p.intro(chalk.hex('#7B68EE')('Update — Refresh KB or Skill'));
}

export async function askUpdateTarget(feature: Feature): Promise<UpdateTarget | symbol> {
  const options: { value: UpdateTarget; label: string; hint?: string }[] = [
    { value: 'kb', label: 'KB' },
  ];

  if (feature.hasSkill) {
    options.push({ value: 'skill', label: 'Skill' });
  } else {
    options.push({ value: 'skill', label: 'Skill', hint: 'no skill yet — run features skill first' });
  }

  return p.select({
    message: 'What do you want to update?',
    options,
  });
}

export async function askRedeploy(): Promise<boolean | symbol> {
  return p.confirm({
    message: 'Redeploy updated skill to code agents?',
  });
}

export function showRunIntro(): void {
  console.log(BANNER);
  p.intro(chalk.hex('#7B68EE')("Implementation — Da'at"));
}

export async function askSelectFeature(features: Feature[]): Promise<string | symbol> {
  return p.select({
    message: 'Select a feature to run',
    options: features.map((f) => ({
      value: f.name as string,
      label: chalk.bold(f.name),
    })),
  });
}

export async function askRunTask(feature: Feature): Promise<string | symbol> {
  const width = (process.stdout.columns || 100) - 2;
  const rule = chalk.dim('─'.repeat(width));

  const kbPath = chalk.hex('#C9A227').underline(feature.kbPath);
  const skillPath = feature.hasSkill
    ? chalk.hex('#7B68EE').underline(feature.skillPath)
    : chalk.dim(feature.skillPath);

  console.log(`  📚  ${kbPath}  🛠   ${skillPath}`);
  console.log(`  ${rule}`);

  process.stdout.write(`\n  ${rule}\n`);
  process.stdout.write('\x1b[2A\r');

  return new Promise<string | symbol>((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let sigintCount = 0;

    const done = (value: string | symbol): void => {
      rl.close();
      process.stdout.write('\x1b[1B\n');
      res(value);
    };

    rl.on('SIGINT', () => {
      sigintCount++;
      if (sigintCount >= 2) {
        done(Symbol('cancel'));
        return;
      }
      const hint = chalk.dim('  Press Ctrl-C again to exit');
      process.stdout.write(`\x1b[s\x1b[2B\r${hint}\x1b[u`);
    });

    rl.question(`  ${chalk.hex('#7B68EE')('>')} `, (answer) => {
      done(answer.trim() || Symbol('cancel'));
    });
  });
}
