// error-handler.ts — central error handler. Maps AppError/Zod/MongoDB; never leaks stack traces.
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { duplicateKeyFields } from '../lib/db';
import { AppError } from '../common/errors/app-error';
import { logger } from '../lib/logger';
import { captureException } from '../lib/sentry';
import type { ApiError } from '../shared/types/api';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
   
  _next: NextFunction,
): void {
  let status = 500;
  let body: ApiError = { code: 'INTERNAL', message: 'Something went wrong', requestId: req.requestId };

  if (err instanceof AppError) {
    status = err.status;
    body = {
      code: err.code,
      message: err.expose ? err.message : 'Something went wrong',
      fieldErrors: err.fieldErrors,
      requestId: req.requestId,
    };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      code: 'BAD_REQUEST',
      message: 'Validation failed',
      fieldErrors: err.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
      requestId: req.requestId,
    };
  } else if (err instanceof multer.MulterError) {
    // file uploads: clear messages instead of a generic 500
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large. Please use a smaller image (up to 2 MB).'
      : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Unexpected file field.'
      : 'The file could not be uploaded.';
    body = { code: 'UPLOAD_ERROR', message, requestId: req.requestId };
  } else if (duplicateKeyFields(err)) {
    // unique index violated (phone, email, UTR number, idempotency key, …)
    status = 409;
    const target = duplicateKeyFields(err)!.join(', ') || 'value';
    body = { code: 'CONFLICT', message: `That ${target} is already in use`, requestId: req.requestId };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: err.message, requestId: req.requestId };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 404;
    body = { code: 'NOT_FOUND', message: 'Not found', requestId: req.requestId };
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.requestId, path: req.path }, 'unhandled error');
    captureException(err, { requestId: req.requestId, path: req.path, userId: req.user?.id });
  } else {
    logger.warn({ code: body.code, requestId: req.requestId, path: req.path }, body.message);
  }

  res.status(status).json(body);
}
