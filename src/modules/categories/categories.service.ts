// categories.service.ts — categories + one level of sub-categories, for portal links (LINKS)
// and downloadable templates (DOCUMENTS). Admin-managed.
import { AppError } from '../../common/errors/app-error';
import { Category, DocumentModel, GovernmentLink } from '../../db/models';
import { connectDb, toPlain } from '../../lib/db';
import { logger } from '../../lib/logger';
import { writeAudit } from '../audit/audit.service';

export type Scope = 'LINKS' | 'DOCUMENTS' | 'DRAFTS';
/** Which category tree a document of this kind uses. */
export const scopeForKind = (kind: 'APPLICATION' | 'DRAFT' | undefined | null): Scope => (kind === 'DRAFT' ? 'DRAFTS' : 'DOCUMENTS');
interface Actor { id: string; requestId?: string; ip?: string | null }
export interface CategoryRecord {
  id: string; scope: Scope; nameKn: string; nameEn: string | null; parentId: string | null; sortOrder: number;
}

const itemModel = (scope: Scope) => (scope === 'LINKS' ? GovernmentLink : DocumentModel);

export async function list(scope: Scope): Promise<CategoryRecord[]> {
  await connectDb();
  const rows = await Category.find({ scope }).sort({ sortOrder: 1, nameKn: 1 }).select('-legacyKey').lean();
  return toPlain<CategoryRecord[]>(rows).map((c) => ({ ...c, nameEn: c.nameEn ?? null, parentId: c.parentId ?? null }));
}

/** Throws unless `id` is a category of this scope (used when saving a link/document). */
export async function assertInScope(id: string | null | undefined, scope: Scope) {
  if (!id) return;
  await connectDb();
  if (!(await Category.exists({ _id: id, scope }))) throw AppError.badRequest('Choose a valid category');
}

async function validateParent(scope: Scope, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return null;
  if (parentId === selfId) throw AppError.badRequest('A category cannot be inside itself');
  const parent = await Category.findOne({ _id: parentId, scope }).lean();
  if (!parent) throw AppError.badRequest('Parent category not found');
  if (parent.parentId) throw AppError.badRequest('Sub-categories cannot have their own sub-categories (2 levels only)');
  if (selfId && (await Category.exists({ parentId: selfId }))) {
    throw AppError.badRequest('This category has sub-categories, so it cannot become a sub-category itself');
  }
  return parentId;
}

export async function create(
  input: { scope: Scope; nameKn: string; nameEn?: string | null; parentId?: string | null; sortOrder?: number },
  actor: Actor,
) {
  await connectDb();
  const parentId = await validateParent(input.scope, input.parentId);
  const doc = await Category.create({
    scope: input.scope, nameKn: input.nameKn, nameEn: input.nameEn || null, parentId, sortOrder: input.sortOrder ?? 0,
  });
  await writeAudit({ actorUserId: actor.id, action: 'category.create', entityType: 'category', entityId: doc._id, requestId: actor.requestId, ip: actor.ip, after: { scope: input.scope, nameKn: input.nameKn } });
  return (await list(input.scope)).find((c) => c.id === doc._id)!;
}

export async function update(
  id: string,
  input: { nameKn?: string; nameEn?: string | null; parentId?: string | null; sortOrder?: number },
  actor: Actor,
) {
  await connectDb();
  const cur = await Category.findById(id).lean();
  if (!cur) throw AppError.notFound('Category not found');
  const set: Record<string, unknown> = {};
  if (input.nameKn !== undefined) set.nameKn = input.nameKn;
  if (input.nameEn !== undefined) set.nameEn = input.nameEn || null;
  if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder;
  if (input.parentId !== undefined) set.parentId = await validateParent(cur.scope as Scope, input.parentId, id);
  await Category.updateOne({ _id: id }, { $set: set });
  await writeAudit({ actorUserId: actor.id, action: 'category.update', entityType: 'category', entityId: id, requestId: actor.requestId, ip: actor.ip });
  return (await list(cur.scope as Scope)).find((c) => c.id === id)!;
}

/** Delete only when empty, so nothing silently loses its category. */
export async function remove(id: string, actor: Actor) {
  await connectDb();
  const cur = await Category.findById(id).lean();
  if (!cur) throw AppError.notFound('Category not found');
  const subs = await Category.countDocuments({ parentId: id });
  if (subs) throw new AppError(409, 'CATEGORY_IN_USE', `Delete or move its ${subs} sub-categor${subs === 1 ? 'y' : 'ies'} first.`);
  const filter = cur.scope === 'LINKS' ? { categoryId: id } : { categoryId: id, archivedAt: null, kind: cur.scope === 'DRAFTS' ? 'DRAFT' : { $ne: 'DRAFT' } };
  const items = await (itemModel(cur.scope as Scope) as typeof GovernmentLink).countDocuments(filter);
  if (items) {
    const what = cur.scope === 'LINKS' ? 'link' : cur.scope === 'DRAFTS' ? 'draft' : 'application form';
    throw new AppError(409, 'CATEGORY_IN_USE', `${items} ${what}${items === 1 ? ' is' : 's are'} in this category. Move ${items === 1 ? 'it' : 'them'} to another category first.`);
  }
  await Category.deleteOne({ _id: id });
  await writeAudit({ actorUserId: actor.id, action: 'category.delete', entityType: 'category', entityId: id, requestId: actor.requestId, ip: actor.ip, before: { nameKn: cur.nameKn } });
  return { ok: true };
}

// ── One-time setup / migration (safe on every start) ──
const LINK_DEFAULTS = [
  { legacyKey: 'STATE', nameKn: 'ಕರ್ನಾಟಕ ಸರ್ಕಾರ', nameEn: 'Government of Karnataka', sortOrder: 10 },
  { legacyKey: 'CENTRAL', nameKn: 'ಭಾರತ ಸರ್ಕಾರ', nameEn: 'Government of India', sortOrder: 20 },
  { legacyKey: 'OTHER', nameKn: 'ಇತರೆ', nameEn: 'Other', sortOrder: 90 },
];

export async function ensureDefaultCategories() {
  await connectDb();
  // Portal links: create Karnataka / India / Other once, then file links that have no category yet.
  if (!(await Category.exists({ scope: 'LINKS' }))) {
    await Category.insertMany(LINK_DEFAULTS.map((d) => ({ ...d, scope: 'LINKS', parentId: null })));
    logger.info('created default portal link categories');
  }
  const linkCats = await Category.find({ scope: 'LINKS', legacyKey: { $ne: null } }).lean();
  for (const c of linkCats) {
    await GovernmentLink.updateMany(
      { categoryId: null, ...(c.legacyKey === 'OTHER' ? { category: { $nin: ['STATE', 'CENTRAL'] } } : { category: c.legacyKey }) },
      { $set: { categoryId: c._id } },
    );
  }
  // Older documents have no kind yet: they are application forms.
  await DocumentModel.updateMany({ kind: { $exists: false } }, { $set: { kind: 'APPLICATION' } });
  // Templates: turn each old free-text label into a category, once.
  const unfiled = await DocumentModel.find({ categoryId: null, archivedAt: null }).select('category').lean();
  for (const d of unfiled) {
    const label = (d.category ?? '').trim() || 'ಸಾಮಾನ್ಯ · General';
    const key = `label:${label.toLowerCase()}`;
    let catId = (await Category.findOne({ scope: 'DOCUMENTS', legacyKey: key }).select('_id').lean())?._id;
    if (!catId) {
      const [kn, ...en] = label.split(' · ');
      catId = (await Category.create({ scope: 'DOCUMENTS', nameKn: kn, nameEn: en.join(' · ') || null, parentId: null, legacyKey: key, sortOrder: 50 }))._id;
    }
    await DocumentModel.updateOne({ _id: d._id }, { $set: { categoryId: catId } });
  }
}
