// crud.ts — small helpers shared by the simple content repositories.
import type { Model } from 'mongoose';
import { connectDb, toPlain } from './db';
import { AppError } from '../common/errors/app-error';

 
type AnyModel = Model<any>;

export function crud<T = Record<string, any>>(model: AnyModel) {
  return {
    async findById(id: string): Promise<T | null> {
      await connectDb();
      const d = await model.findById(id).lean();
      return d ? toPlain<T>(d) : null;
    },
    async create(data: Record<string, unknown>): Promise<T> {
      await connectDb();
      return toPlain<T>((await model.create(data)).toObject());
    },
    /** Throws 404 when the document doesn't exist. */
    async update(id: string, data: Record<string, unknown>): Promise<T> {
      await connectDb();
      const set = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      const d = await model.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true }).lean();
      if (!d) throw AppError.notFound('Not found');
      return toPlain<T>(d);
    },
  };
}
