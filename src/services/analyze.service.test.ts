import { describe, it, expect } from 'vitest';
import { InventoryEntrySchema } from './analyze.service.js';

describe('InventoryEntrySchema', () => {
  it('defaults old entries to business kind', () => {
    const result = InventoryEntrySchema.safeParse({
      id: 'billing',
      area: 'payments',
      name: 'Billing',
      summary: 'Handles billing.',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('business');
  });

  it('accepts a valid entry with complexity', () => {
    const result = InventoryEntrySchema.safeParse({
      id: 'billing',
      area: 'payments',
      name: 'Billing',
      summary: 'Handles billing.',
      complexity: 'moderate',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.complexity).toBe('moderate');
  });

  it('accepts technical entries', () => {
    const result = InventoryEntrySchema.safeParse({
      id: 'release-pipeline',
      area: 'platform',
      name: 'Release pipeline',
      summary: 'Ships the CLI.',
      kind: 'technical',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('technical');
  });

  it('rejects invalid complexity values', () => {
    const result = InventoryEntrySchema.safeParse({
      id: 'billing',
      area: 'payments',
      name: 'Billing',
      summary: 'Handles billing.',
      complexity: 'very-complex',
    });
    expect(result.success).toBe(false);
  });
});
