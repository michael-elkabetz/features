import { z } from 'zod';
import { type Issue, type ParseResult, failed, issue, parsed } from '../types.js';

/** Inclusive 1-indexed line range inside a source file. */
export const LineRangeSchema = z
  .object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine((r) => r.end >= r.start, { message: 'end must be >= start' });

export type LineRange = z.infer<typeof LineRangeSchema>;

/**
 * A code reference as authored in a ```ref fenced block.
 * Code is never embedded — the compiler extracts it from path+lines.
 */
export const CodeRefSchema = z.object({
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
  sha: z
    .string()
    .regex(/^[0-9a-f]{6,40}$/i, 'sha must be a hex git sha (6-40 chars)')
    .optional(),
});

export type CodeRef = z.infer<typeof CodeRefSchema>;

const KNOWN_KEYS = new Set(['path', 'lines', 'symbol', 'what', 'note', 'sha']);

/** Parse `12-28` or `42` into a LineRange. */
export function parseLineRange(raw: string): LineRange | undefined {
  const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(raw.trim());
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  if (start < 1 || end < start) return undefined;
  return { start, end };
}

/**
 * Parse the body of a ```ref fenced block.
 * Format: one `key: value` per line; values may contain colons; quotes optional.
 *
 * @param body - the fenced block content (without the fence markers)
 * @param baseLine - 1-indexed line of the block in the md file, for issue positions
 */
export function parseRefBlock(body: string, baseLine = 1): ParseResult<CodeRef> {
  const issues: Issue[] = [];
  const fields: Record<string, string> = {};

  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const m = /^(\w+)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      issues.push(issue('malformed-ref', `Unparseable line in ref block: "${line.trim()}"`, baseLine + i));
      continue;
    }
    const key = m[1]!;
    let value = m[2]!.trim();
    // strip surrounding quotes and trailing inline comments like `sha: abc123  # note`
    value = value.replace(/\s+#.*$/, '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!KNOWN_KEYS.has(key)) {
      issues.push(issue('unknown-ref-key', `Unknown key "${key}" in ref block`, baseLine + i));
      continue;
    }
    fields[key] = value;
  }

  const range = fields['lines'] !== undefined ? parseLineRange(fields['lines']) : undefined;
  if (fields['lines'] !== undefined && !range) {
    issues.push(issue('malformed-ref', `Invalid lines value "${fields['lines']}" — expected "12-28" or "42"`, baseLine));
  }

  const candidate = {
    path: fields['path'],
    lines: range,
    symbol: fields['symbol'],
    what: fields['what'],
    note: fields['note'],
    sha: fields['sha']?.toLowerCase(),
  };

  const result = CodeRefSchema.safeParse(candidate);
  if (!result.success) {
    for (const e of result.error.issues) {
      issues.push(issue('malformed-ref', `ref.${e.path.join('.')}: ${e.message}`, baseLine));
    }
    return failed(issues);
  }
  // Unknown-key / unparseable-line problems are fatal too: the author meant something we dropped.
  if (issues.length > 0) return failed(issues);
  return parsed(result.data);
}
