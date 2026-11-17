// validate.ts — Zod validation for body/query/params → typed data on req, or 400 with fieldErrors.
import type { Request, Response, NextFunction } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from '../common/errors/app-error';

type Source = 'body' | 'query' | 'params';

function toFieldErrors(err: z.ZodError) {
  return err.issues.map((e) => ({ field: e.path.join('.') || '(root)', message: e.message }));
}

/** Returns middleware that validates one source and stores the parsed value on req.valid[source]. */
export function validate<T extends ZodTypeAny>(schema: T, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(AppError.badRequest('Validation failed', toFieldErrors(result.error)));
      return;
    }
    const bag = req as Request & { valid?: Record<string, unknown> };
    bag.valid = { ...bag.valid, [source]: result.data };
    next();
  };
}

/**
 * Accessor for data already validated by validate(). The shape is guaranteed at runtime by the
 * Zod middleware, so the generic defaults to `any` to keep call sites terse; pass an explicit
 * type argument (valid<MyInput>(req)) when you want the compiler to check the consumer.
 */
 
export function valid<T = any>(req: Request, source: Source = 'body'): T {
  return (req as Request & { valid?: Record<string, unknown> }).valid?.[source] as T;
}

export type Validated<T extends ZodTypeAny> = z.infer<T>;
