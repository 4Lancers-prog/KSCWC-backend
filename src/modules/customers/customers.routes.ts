// customers.routes.ts — operator customer CRUD + admin cross-user listing.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import {
  customerCreateSchema,
  customerUpdateSchema,
  customerStatusSchema,
  customerFilterSchema,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type CustomerFilter,
} from '../../shared/schemas/customer.schema';
import * as customers from './customers.service';

const router = Router();
const reqOf = (req: import('express').Request): customers.Requester => ({
  id: req.user!.id,
  role: req.user!.role,
  requestId: req.requestId,
  ip: req.ip,
});
const idParam = z.object({ id: z.string().uuid() });

router.post(
  '/customers',
  requireAuth,
  validate(customerCreateSchema),
  asyncHandler(async (req, res) => {
    const created = await customers.createCustomer(valid<CustomerCreateInput>(req), reqOf(req));
    res.status(201).json({ customer: created });
  }),
);

router.get(
  '/customers',
  requireAuth,
  validate(customerFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await customers.listCustomers(valid<CustomerFilter>(req, 'query'), reqOf(req)));
  }),
);

router.get(
  '/customers/:id',
  requireAuth,
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await customers.getCustomer(req.params.id!, reqOf(req)));
  }),
);

router.patch(
  '/customers/:id',
  requireAuth,
  validate(idParam, 'params'),
  validate(customerUpdateSchema),
  asyncHandler(async (req, res) => {
    const updated = await customers.updateCustomer(req.params.id!, valid<CustomerUpdateInput>(req), reqOf(req));
    res.json({ customer: updated });
  }),
);

router.post(
  '/customers/:id/status',
  requireAuth,
  validate(idParam, 'params'),
  validate(customerStatusSchema),
  asyncHandler(async (req, res) => {
    const { status, reason } = valid<{ status: import('../../shared/constants/customer-status').CustomerStatus; reason?: string }>(req);
    const updated = await customers.changeStatus(req.params.id!, status, reason, reqOf(req));
    res.json({ customer: updated });
  }),
);

// Admin cross-user listing (same handler; privilege unlocks ownerUserId filter + all records).
router.get(
  '/admin/customers',
  requirePermission('customers:read:all'),
  validate(customerFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await customers.listCustomers(valid<CustomerFilter>(req, 'query'), reqOf(req)));
  }),
);

export default router;
