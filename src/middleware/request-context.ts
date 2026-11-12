// request-context.ts — attach a request id to every request + response header.
import type { Request, Response, NextFunction } from 'express';
import { newRequestId } from '../common/utils/request-id';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && /^[\w-]{6,80}$/.test(incoming) ? incoming : newRequestId();
  res.setHeader('x-request-id', req.requestId);
  next();
}
