import { describe, it, expect } from 'vitest';
import { renderSkill } from './skill-template.js';
import type { FeatureDoc } from '../spec/index.js';

const DOC: FeatureDoc = {
  frontmatter: {
    id: 'billing',
    area: 'payments',
    name: 'Card Billing',
    summary: 'Charge a card.',
    status: 'stable',
    complexity: 'moderate',
    related: [],
    specVersion: 1,
    analyzedAt: 'abc123',
  },
  nutshell: "Charges a user's card and records the transaction.",
  howItWorks: ['User submits payment', 'Service charges the card', 'Receipt is stored'],
  flow: [{ label: 'Submit', sub: 'UI' }, { label: 'Charge', sub: 'BillingService' }],
  refs: [
    { path: 'src/billing.ts', lines: { start: 1, end: 10 }, symbol: 'BillingService.charge', what: 'Charges the card', sha: 'abc123' },
    { path: 'src/api/pay.ts', lines: { start: 5, end: 9 }, symbol: 'payHandler', what: 'HTTP entry point', sha: 'abc123' },
  ],
};

describe('renderSkill', () => {
  it('produces a skill that passes the validator rules', () => {
    const md = renderSkill(DOC, '.features/features/billing.md');
    expect(md).toContain('.features/features/billing.md');
    expect(md).toMatch(/Do NOT (explore|scan|investigate)/);
    expect(md).toMatch(/Knowledge Sync/);
    expect(md).toContain('src/billing.ts');
    expect(md).toContain('src/api/pay.ts');
    expect(md).toContain('# Card Billing Implementation Skill');
  });

  it('stays under 250 lines', () => {
    const md = renderSkill(DOC, '.features/features/billing.md');
    expect(md.split('\n').length).toBeLessThan(250);
  });
});
