// categories.routes.ts — public list per scope + admin create/rename/move/delete.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { Category } from '../../db/models';
import { connectDb } from '../../lib/db';
import { AppError } from '../../common/errors/app-error';
import * as svc from './categories.service';

const router = Router();
const actorOf = (req: Request) => ({ id: req.user!.id, requestId: req.requestId, ip: req.ip });
const scopeQuery = z.object({ scope: z.enum(['LINKS', 'DOCUMENTS', 'DRAFTS']) });
const idParam = z.object({ id: z.string().uuid() });
const name = z.string().trim().min(1, 'Enter a name').max(120);
const createSchema = z.object({
  scope: z.enum(['LINKS', 'DOCUMENTS', 'DRAFTS']),
  nameKn: name,
  nameEn: z.string().trim().max(120).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});
const updateSchema = createSchema.omit({ scope: true }).partial();

// links → links:manage, templates → documents:manage
const PERM = { LINKS: 'links:manage', DOCUMENTS: 'documents:manage', DRAFTS: 'documents:manage' } as const;
function permForScope(getScope: (req: Request) => Promise<'LINKS' | 'DOCUMENTS' | 'DRAFTS'>) {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const scope = await getScope(req);
    return requirePermission(PERM[scope])(req, res, next);
  });
}
const scopeOfCategory = async (req: Request) => {
  await connectDb();
  const c = await Category.findById(req.params.id).select('scope').lean();
  if (!c) throw AppError.notFound('Category not found');
  return c.scope as 'LINKS' | 'DOCUMENTS' | 'DRAFTS';
};

router.get('/public/categories', validate(scopeQuery, 'query'),
  asyncHandler(async (req, res) => res.json({ items: await svc.list(valid<{ scope: svc.Scope }>(req, 'query').scope) })));

router.post('/admin/categories', validate(createSchema), permForScope(async (req) => req.body.scope),
  asyncHandler(async (req, res) => res.status(201).json({ category: await svc.create(valid(req), actorOf(req)) })));
router.patch('/admin/categories/:id', validate(idParam, 'params'), validate(updateSchema), permForScope(scopeOfCategory),
  asyncHandler(async (req, res) => res.json({ category: await svc.update(req.params.id!, valid(req), actorOf(req)) })));
router.delete('/admin/categories/:id', validate(idParam, 'params'), permForScope(scopeOfCategory),
  asyncHandler(async (req, res) => res.json(await svc.remove(req.params.id!, actorOf(req)))));

export default router;
