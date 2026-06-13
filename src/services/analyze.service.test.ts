import { describe, it, expect } from 'vitest';
import { InventoryEntrySchema } from './analyze.service.js';

describe('InventoryEntrySchema', () => {
  it('accepts a valid entry without complexity', () => {
    const result = InventoryEntrySchema.safeParse({
      id: 'billing',
      area: 'payments',
      name: 'Billing',
      summary: 'Handles billing.',
    });
    expect(result.success).toBe(true);
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
