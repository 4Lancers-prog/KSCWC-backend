// app-error.ts — typed application error + envelope mapper.
import type { FieldError } from '../../shared/types/api';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: FieldError[];
  readonly expose: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    opts: { fieldErrors?: FieldError[]; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fieldErrors = opts.fieldErrors;
    this.expose = opts.expose ?? true;
  }

  static badRequest(message = 'Bad request', fieldErrors?: FieldError[]) {
    return new AppError(400, 'BAD_REQUEST', message, { fieldErrors });
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do that') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message = 'Conflict', fieldErrors?: FieldError[]) {
    return new AppError(409, 'CONFLICT', message, { fieldErrors });
  }
  static tooMany(message = 'Too many requests') {
    return new AppError(429, 'RATE_LIMITED', message);
  }
  static internal(message = 'Something went wrong') {
    return new AppError(500, 'INTERNAL', message, { expose: false });
  }
}
