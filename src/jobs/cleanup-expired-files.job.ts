// cleanup-expired-files.job.ts — housekeeping: auto-archive expired announcements.
// (Generated PDFs are kept so re-download stays free; extend here if a retention policy is set.)
import { Announcement } from '../db/models';
import { connectDb } from '../lib/db';
import { logger } from '../lib/logger';

export async function runCleanup(): Promise<void> {
  try {
    const now = new Date();
    await connectDb();
    const res = await Announcement.updateMany(
      { status: 'PUBLISHED', expiresAt: { $ne: null, $lt: now } },
      { $set: { status: 'ARCHIVED' } },
    );
    const count = res.modifiedCount;
    if (count) logger.info({ archived: count }, 'cleanup: archived expired announcements');
  } catch (err) {
    logger.error({ err }, 'cleanup job failed');
  }
}
