// audit.routes.ts — GET /api/v1/admin/audit-logs (read-only, permission-gated).
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { paginationSchema } from '../../shared/schemas/common.schema';
import { resolvePage, paginate } from '../../common/utils/pagination';
import { listAuditLogs } from './audit.repository';

const router = Router();

const querySchema = paginationSchema.extend({
  entityType: z.string().max(60).optional(),
  actorUserId: z.string().uuid().optional(),
});

router.get(
  '/admin/audit-logs',
  requirePermission('audit:read'),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = valid<z.infer<typeof querySchema>>(req, 'query');
    const page = resolvePage(q.page, q.limit);
    const { items, total } = await listAuditLogs(
      { entityType: q.entityType, actorUserId: q.actorUserId },
      page,
    );
    res.json(paginate(items, total, page));
  }),
);

export default router;
