// content.seed.ts — non-sensitive demo content (announcements + committee members).
import { Announcement, CommitteeMember } from '../models';

export async function seedContent(): Promise<void> {
  const annCount = await Announcement.countDocuments();
  if (annCount === 0) {
    await Announcement.insertMany([
        {
          title: 'ಹೊಸ ನೋಂದಣಿ ಆರಂಭ',
          body: 'ಹೊಸ ಸೇವಾ ಕೇಂದ್ರ ಸಂಚಾಲಕರ ನೋಂದಣಿ ಈಗ ಆರಂಭವಾಗಿದೆ.',
          contentType: 'ANNOUNCEMENT',
          status: 'PUBLISHED',
          publishAt: new Date(),
          sortOrder: 1,
        },
      ]);
  }

  const commCount = await CommitteeMember.countDocuments();
  if (commCount === 0) {
    await CommitteeMember.insertMany([
        { committeeType: 'FOUNDER', name: 'ಸಂಸ್ಥಾಪಕ ಅಧ್ಯಕ್ಷರು', roleTitle: 'Founder President', sortOrder: 1 },
        { committeeType: 'STATE', name: 'ರಾಜ್ಯ ಕಾರ್ಯದರ್ಶಿ', roleTitle: 'State Secretary', sortOrder: 1 },
        { committeeType: 'DISTRICT', name: 'ಜಿಲ್ಲಾ ಸಂಯೋಜಕರು', roleTitle: 'District Coordinator', district: 'Bengaluru Urban', sortOrder: 1 },
      ]);
  }
  // eslint-disable-next-line no-console
  console.log('✔ seeded demo content');
}
