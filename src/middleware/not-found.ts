// not-found.ts — unknown /api route. Usually means the website is newer than this server
// (the latest backend hasn't been deployed yet), so say that plainly.
import type { Request, Response } from 'express';
import { API_VERSION } from '../config/version';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    code: 'ROUTE_NOT_FOUND',
    message: 'This server does not have this feature (it may be running an older version). Ask the admin to check the latest server deploy.',
    serverVersion: API_VERSION,
    requestId: req.requestId,
  });
}
