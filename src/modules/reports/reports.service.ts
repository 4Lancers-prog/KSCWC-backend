// reports.service.ts — assemble report payloads + CSV export (same filters, server-side).
import { roleHas } from '../../config/permissions';
import type { Role } from '../../shared/constants/roles';
import type { ReportFilter } from '../../shared/schemas/report.schema';
import { buildWhere, listAll, type CustomerFilter } from '../customers/customers.repository';
import { formatPaisePlain } from '../../common/utils/money';
import { buildCsvDocument } from '../../common/utils/csv';
import * as repo from './reports.repository';

interface Requester {
  id: string;
  role: Role;
}

function scopeWhere(filter: ReportFilter, requester: Requester): CustomerFilter {
  const canAll = roleHas(requester.role, 'reports:read:all');
  return buildWhere({
    ownerUserId: canAll ? filter.ownerUserId : requester.id,
    status: filter.status,
    serviceId: filter.serviceId,
    from: filter.from,
    to: filter.to,
  });
}

export async function customerReport(filter: ReportFilter, requester: Requester) {
  const where = scopeWhere(filter, requester);
  const [totals, byStatus, byService, byDay] = await Promise.all([
    repo.totals(where),
    repo.byStatus(where),
    repo.byService(where),
    repo.byDay(where),
  ]);
  return { totals, byStatus, byService, byDay };
}

export async function exportCustomersCsv(filter: ReportFilter, requester: Requester): Promise<string> {
  const where = scopeWhere(filter, requester);
  const rows = await listAll(where);
  const header = ['Customer', 'Mobile', 'Aadhaar (masked)', 'PAN (masked)', 'Service', 'Reference', 'Fee (₹)', 'Status', 'Created'];
  const body = rows.map((c) => [
    c.fullName,
    c.mobileNormalized,
    (c as { aadhaarMasked?: string | null }).aadhaarMasked ?? '',
    (c as { panMasked?: string | null }).panMasked ?? '',
    c.service?.nameEn ?? c.service?.nameKn ?? '',
    c.referenceCode ?? '',
    c.feePaise != null ? formatPaisePlain(c.feePaise) : '',
    c.status,
    c.createdAt.toISOString(),
  ]);
  return buildCsvDocument(header, body, {
    generatedAt: new Date(),
    filters: {
      ownerUserId: roleHas(requester.role, 'reports:read:all') ? filter.ownerUserId : requester.id,
      status: filter.status,
      serviceId: filter.serviceId,
      from: filter.from?.toISOString(),
      to: filter.to?.toISOString(),
    },
  });
}
