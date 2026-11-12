// pagination.ts — page/limit helpers with a strict maximum.
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';
import type { Paginated } from '../../shared/types/api';

export interface PageParams {
  page: number;
  limit: number;
}

export function resolvePage(page?: number, limit?: number): PageParams {
  const p = Math.max(1, Math.floor(page ?? 1));
  const l = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit ?? DEFAULT_PAGE_SIZE)));
  return { page: p, limit: l };
}

export function paginate<T>(items: T[], total: number, { page, limit }: PageParams): Paginated<T> {
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const skip = ({ page, limit }: PageParams): number => (page - 1) * limit;
