export type ErrorCode =
  | 'CLAUDE_NOT_FOUND'
  | 'CLAUDE_FAILED'
  | 'FEATURE_NOT_FOUND'
  | 'KB_NOT_FOUND'
  | 'SKILL_NOT_FOUND'
  | 'GIT_FAILED'
  | 'FILESYSTEM_ERROR'
  | 'EDITOR_FAILED'
  | 'CANCELLED';

export interface AppError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E = AppError> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = AppError> = Success<T> | Failure<E>;

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function fail(code: ErrorCode, message: string, cause?: unknown): Failure {
  return { ok: false, error: { code, message, cause } };
}
