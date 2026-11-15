// government-links.routes.ts — public list + admin CRUD.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { govLinkCreateSchema, govLinkUpdateSchema } from '../../shared/schemas/content.schema';
import * as svc from './government-links.service';

const router = Router();
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });

// Visitors see the list (names, descriptions) but NOT the addresses — opening a portal needs a
// login. Logged-in users get the addresses. The response depends on the session, so never cache it.
router.get('/public/government-links', asyncHandler(async (req, res) => {
  const items = (await svc.listPublic()) as Array<Record<string, unknown>>;
  res.set('Cache-Control', 'private, no-store');
  res.json({ items: req.user ? items : items.map((l) => ({ ...l, url: null, locked: true })) });
}));
router.get('/admin/government-links', requirePermission('links:manage'), asyncHandler(async (_req, res) => res.json({ items: await svc.listAdmin() })));
router.post('/admin/government-links', requirePermission('links:manage'), validate(govLinkCreateSchema),
  asyncHandler(async (req, res) => res.status(201).json({ link: await svc.createLink(valid(req), actorOf(req)) })));
router.patch('/admin/government-links/:id', requirePermission('links:manage'), validate(idParam, 'params'), validate(govLinkUpdateSchema),
  asyncHandler(async (req, res) => res.json({ link: await svc.updateLink(req.params.id!, valid(req), actorOf(req)) })));
router.post('/admin/government-links/:id/deactivate', requirePermission('links:manage'), validate(idParam, 'params'),
  asyncHandler(async (req, res) => res.json({ link: await svc.deactivateLink(req.params.id!, actorOf(req)) })));

export default router;
