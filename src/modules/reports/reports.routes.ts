// reports.routes.ts — my report, admin report, and CSV exports (server-side filters).
import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { requireAuth } from '../../middleware/require-auth';
import { requirePermission } from '../../middleware/require-role';
import { validate, valid } from '../../middleware/validate';
import { reportFilterSchema, type ReportFilter } from '../../shared/schemas/report.schema';
import * as reports from './reports.service';

const router = Router();
const reqOf = (req: import('express').Request) => ({ id: req.user!.id, role: req.user!.role });

function sendCsv(res: import('express').Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get(
  '/reports/my-customers',
  requireAuth,
  validate(reportFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.customerReport(valid<ReportFilter>(req, 'query'), reqOf(req)));
  }),
);

router.get(
  '/reports/export.csv',
  requireAuth,
  validate(reportFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    const csv = await reports.exportCustomersCsv(valid<ReportFilter>(req, 'query'), reqOf(req));
    sendCsv(res, `my-customers-${Date.now()}.csv`, csv);
  }),
);

router.get(
  '/admin/reports/customers',
  requirePermission('reports:read:all'),
  validate(reportFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await reports.customerReport(valid<ReportFilter>(req, 'query'), reqOf(req)));
  }),
);

router.get(
  '/admin/reports/export.csv',
  requirePermission('reports:read:all'),
  validate(reportFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    const csv = await reports.exportCustomersCsv(valid<ReportFilter>(req, 'query'), reqOf(req));
    sendCsv(res, `all-customers-${Date.now()}.csv`, csv);
  }),
);

export default router;
