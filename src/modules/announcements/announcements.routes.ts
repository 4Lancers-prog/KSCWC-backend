// announcements.routes.ts — public published list + admin CRUD.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { paginationSchema } from '../../shared/schemas/common.schema';
import { announcementCreateSchema, announcementUpdateSchema } from '../../shared/schemas/content.schema';
import { resolvePage, paginate } from '../../common/utils/pagination';
import * as svc from './announcements.service';

const router = Router();
const actorOf = (req: import('express').Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const idParam = z.object({ id: z.string().uuid() });

router.get('/public/announcements', asyncHandler(async (_req, res) => {
  res.json({ items: await svc.listPublic() });
}));

router.get('/admin/announcements', requirePermission('content:manage'), validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = valid<z.infer<typeof paginationSchema>>(req, 'query');
    const page = resolvePage(q.page, q.limit);
    const { items, total } = await svc.listAdmin(page);
    res.json(paginate(items, total, page));
  }));

router.post('/admin/announcements', requirePermission('content:manage'), validate(announcementCreateSchema),
  asyncHandler(async (req, res) => res.status(201).json({ announcement: await svc.createAnnouncement(valid(req), actorOf(req)) })));

router.patch('/admin/announcements/:id', requirePermission('content:manage'), validate(idParam, 'params'), validate(announcementUpdateSchema),
  asyncHandler(async (req, res) => res.json({ announcement: await svc.updateAnnouncement(req.params.id!, valid(req), actorOf(req)) })));

router.post('/admin/announcements/:id/archive', requirePermission('content:manage'), validate(idParam, 'params'),
  asyncHandler(async (req, res) => res.json({ announcement: await svc.archiveAnnouncement(req.params.id!, actorOf(req)) })));

export default router;
