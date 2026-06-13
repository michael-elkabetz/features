import { describe, it, expect } from 'vitest';
import { extractImportSpecifiers } from './import-graph.js';

describe('extractImportSpecifiers', () => {
  it('pulls module specifiers from JS/TS import & require', () => {
    const src = `import { a } from './foo';\nimport b from "../bar/baz";\nconst c = require('./qux');\nimport('./dyn');`;
    const specs = extractImportSpecifiers(src, 'a.ts');
    expect(specs).toContain('./foo');
    expect(specs).toContain('../bar/baz');
    expect(specs).toContain('./qux');
    expect(specs).toContain('./dyn');
  });

  it('pulls python imports', () => {
    const src = `from app.models import User\nimport os`;
    const specs = extractImportSpecifiers(src, 'a.py');
    expect(specs).toContain('app.models');
    expect(specs).toContain('os');
  });

  it('returns [] for files with no imports', () => {
    expect(extractImportSpecifiers('x = 1', 'a.ts')).toEqual([]);
  });
});
