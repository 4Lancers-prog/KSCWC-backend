// cleanup-expired-files.job.ts — housekeeping: auto-archive expired announcements.
// (Generated PDFs are kept so re-download stays free; extend here if a retention policy is set.)
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export async function runCleanup(): Promise<void> {
  try {
    const now = new Date();
    const res = await prisma.announcement.updateMany({
      where: { status: 'PUBLISHED', expiresAt: { not: null, lt: now } },
      data: { status: 'ARCHIVED' },
    });
    if (res.count) logger.info({ archived: res.count }, 'cleanup: archived expired announcements');
  } catch (err) {
    logger.error({ err }, 'cleanup job failed');
  }
}
