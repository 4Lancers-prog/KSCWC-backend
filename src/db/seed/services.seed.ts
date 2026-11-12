// services.seed.ts — default active service catalogue (Kannada-first).
import { prisma } from '../../lib/prisma';

const SERVICES = [
  { code: 'AADHAAR_UPDATE', nameKn: 'ಆಧಾರ್ ನವೀಕರಣ', nameEn: 'Aadhaar Update', sortOrder: 1 },
  { code: 'PAN_CARD', nameKn: 'ಪ್ಯಾನ್ ಕಾರ್ಡ್', nameEn: 'PAN Card', sortOrder: 2 },
  { code: 'RATION_CARD', nameKn: 'ಪಡಿತರ ಚೀಟಿ', nameEn: 'Ration Card', sortOrder: 3 },
  { code: 'INCOME_CERT', nameKn: 'ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ', nameEn: 'Income Certificate', sortOrder: 4 },
  { code: 'CASTE_CERT', nameKn: 'ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ', nameEn: 'Caste Certificate', sortOrder: 5 },
  { code: 'FID_CARD', nameKn: 'ಎಫ್‌ಐಡಿ ಕಾರ್ಡ್', nameEn: 'FID Card', sortOrder: 6 },
  { code: 'OTHER', nameKn: 'ಇತರೆ ಸೇವೆಗಳು', nameEn: 'Other Services', sortOrder: 99 },
];

export async function seedServices(): Promise<void> {
  for (const s of SERVICES) {
    await prisma.service.upsert({
      where: { code: s.code },
      update: { nameKn: s.nameKn, nameEn: s.nameEn, sortOrder: s.sortOrder, isActive: true },
      create: { ...s, isActive: true },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`✔ seeded ${SERVICES.length} services`);
}
