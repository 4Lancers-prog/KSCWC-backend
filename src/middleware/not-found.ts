// not-found.ts — 404 for unmatched routes.
import type { Request, Response } from 'express';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found', requestId: req.requestId });
}
