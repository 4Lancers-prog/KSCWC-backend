// content.seed.ts — non-sensitive demo content (announcements + committee members).
import { prisma } from '../../lib/prisma';

export async function seedContent(): Promise<void> {
  const annCount = await prisma.announcement.count();
  if (annCount === 0) {
    await prisma.announcement.createMany({
      data: [
        {
          title: 'ಹೊಸ ನೋಂದಣಿ ಆರಂಭ',
          body: 'ಹೊಸ ಸೇವಾ ಕೇಂದ್ರ ಸಂಚಾಲಕರ ನೋಂದಣಿ ಈಗ ಆರಂಭವಾಗಿದೆ.',
          contentType: 'ANNOUNCEMENT',
          status: 'PUBLISHED',
          publishAt: new Date(),
          sortOrder: 1,
        },
      ],
    });
  }

  const commCount = await prisma.committeeMember.count();
  if (commCount === 0) {
    await prisma.committeeMember.createMany({
      data: [
        { committeeType: 'FOUNDER', name: 'ಸಂಸ್ಥಾಪಕ ಅಧ್ಯಕ್ಷರು', roleTitle: 'Founder President', sortOrder: 1 },
        { committeeType: 'STATE', name: 'ರಾಜ್ಯ ಕಾರ್ಯದರ್ಶಿ', roleTitle: 'State Secretary', sortOrder: 1 },
        { committeeType: 'DISTRICT', name: 'ಜಿಲ್ಲಾ ಸಂಯೋಜಕರು', roleTitle: 'District Coordinator', district: 'Bengaluru Urban', sortOrder: 1 },
      ],
    });
  }
  // eslint-disable-next-line no-console
  console.log('✔ seeded demo content');
}
