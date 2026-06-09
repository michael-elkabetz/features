/** A single structured problem found while parsing or validating a document. */
export interface Issue {
  /** Machine-readable code, e.g. 'missing-section', 'bad-frontmatter', 'malformed-ref'. */
  readonly code: string;
  /** Human-readable explanation, specific enough to fix the file. */
  readonly message: string;
  /** 1-indexed line in the source md file, when known. */
  readonly line?: number;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly doc: T; readonly warnings: readonly Issue[] }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export function parsed<T>(doc: T, warnings: readonly Issue[] = []): ParseResult<T> {
  return { ok: true, doc, warnings };
}

export function failed<T>(issues: readonly Issue[]): ParseResult<T> {
  return { ok: false, issues };
}

export function issue(code: string, message: string, line?: number): Issue {
  return line === undefined ? { code, message } : { code, message, line };
}
