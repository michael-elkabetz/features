import type { CodeRef, LineRange, RefProvenance, StaleReason } from '../spec/index.js';
import { collectDeclarations, matchSymbol, splitSymbol } from './symbol-resolver.js';

/** Outcome of verifying one code reference against the live source. */
export interface VerifyOutcome {
  /** The range the compiler should extract the snippet from. */
  readonly lines: LineRange;
  readonly provenance: RefProvenance;
  readonly verifiedBy: 'tree-sitter' | 'grep' | 'none';
  readonly healed: boolean;
  readonly stale: boolean;
  readonly staleReason?: StaleReason;
}

function clamp(range: LineRange, totalLines: number): LineRange {
  const start = Math.min(Math.max(1, range.start), totalLines);
  const end = Math.min(Math.max(start, range.end), totalLines);
  return { start, end };
}

function within(inner: LineRange, outer: LineRange): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

/**
 * The authored range still points at the declaration when one contains the other:
 * authored ⊆ decl (a sub-range of a large class) or decl ⊆ authored (decl plus a
 * little context). Mere partial overlap means the code shifted — that must heal,
 * otherwise the snippet starts at the wrong line.
 */
function stillAccurate(authored: LineRange, decl: LineRange): boolean {
  return within(authored, decl) || within(decl, authored);
}

/** Word-boundary occurrence lines of the symbol's last part. */
function grepLines(sourceLines: readonly string[], symbol: string): number[] {
  const parts = splitSymbol(symbol);
  const target = parts[parts.length - 1];
  if (!target) return [];
  const pattern = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const hits: number[] = [];
  for (let i = 0; i < sourceLines.length; i++) {
    if (pattern.test(sourceLines[i]!)) hits.push(i + 1);
  }
  return hits;
}

/**
 * Verify a code reference against the current file content.
 *
 * - tree-sitter resolves the symbol to its real declaration range; drifted authored
 *   ranges are auto-healed to the resolved range.
 * - When no grammar matches (or the symbol isn't a declaration, e.g. a call site),
 *   fall back to word-boundary grep.
 * - Without a symbol, the range can only be bounds-checked → `unverified`.
 */
export async function verifyRef(source: string, ref: CodeRef): Promise<VerifyOutcome> {
  const sourceLines = source.split('\n');
  const totalLines = sourceLines.length;
  const authored = ref.lines;

  if (authored.start > totalLines) {
    // Range is entirely beyond EOF; clamp so the viewer can still show *something*.
    return {
      lines: clamp(authored, totalLines),
      provenance: 'stale',
      verifiedBy: 'none',
      healed: false,
      stale: true,
      staleReason: 'lines-out-of-range',
    };
  }

  if (!ref.symbol) {
    return {
      lines: clamp(authored, totalLines),
      provenance: 'unverified',
      verifiedBy: 'none',
      healed: false,
      stale: false,
    };
  }

  // --- tree-sitter pass ---
  const declarations = await collectDeclarations(source, ref.path);
  if (declarations) {
    const match = matchSymbol(declarations, ref.symbol, authored);
    if (match) {
      if (stillAccurate(authored, match.range)) {
        // Authored range still points at (or into) the right declaration.
        return {
          lines: clamp(authored, totalLines),
          provenance: 'verified',
          verifiedBy: 'tree-sitter',
          healed: false,
          stale: false,
        };
      }
      // Code moved: heal to the resolved declaration range.
      return {
        lines: match.range,
        provenance: 'healed',
        verifiedBy: 'tree-sitter',
        healed: true,
        stale: false,
      };
    }
    // Grammar parsed the file but no declaration matches — the symbol may be a call
    // site or was removed. Try grep before declaring it stale.
  }

  // --- grep fallback ---
  const hits = grepLines(sourceLines, ref.symbol);
  if (hits.length > 0) {
    const inRange = hits.some((line) => line >= authored.start && line <= authored.end);
    if (inRange) {
      return {
        lines: clamp(authored, totalLines),
        provenance: 'verified',
        verifiedBy: 'grep',
        healed: false,
        stale: false,
      };
    }
    // Heal: keep the authored window size, repositioned at the first occurrence.
    const span = authored.end - authored.start;
    const start = hits[0]!;
    return {
      lines: clamp({ start, end: start + span }, totalLines),
      provenance: 'healed',
      verifiedBy: 'grep',
      healed: true,
      stale: false,
    };
  }

  return {
    lines: clamp(authored, totalLines),
    provenance: 'stale',
    verifiedBy: 'none',
    healed: false,
    stale: true,
    staleReason: 'symbol-not-found',
  };
}

/** Extract the snippet for a (verified) range, 1-indexed inclusive. */
export function extractSnippet(source: string, lines: LineRange): string {
  return source
    .split('\n')
    .slice(lines.start - 1, lines.end)
    .join('\n');
}
