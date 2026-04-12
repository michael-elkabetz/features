import { isCancel } from '@clack/prompts';
import type { AppError, ErrorCode } from '../types/index.js';

export function toAppError(err: unknown, code: ErrorCode = 'FILESYSTEM_ERROR'): AppError {
  if (err instanceof Error) {
    return { code, message: err.message, cause: err };
  }
  if (typeof err === 'string') {
    return { code, message: err };
  }
  return { code, message: 'Unknown error', cause: err };
}

export function isCancelled(value: unknown): value is symbol {
  return typeof value === 'symbol' || isCancel(value);
}
