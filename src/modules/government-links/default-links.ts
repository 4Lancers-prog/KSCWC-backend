// default-links.ts — official portals CSC operators use daily. Loaded automatically when no
// working government links exist yet (fresh database, or rows saved before the url fix).
// Addresses were checked against official sources (district nic.in sites, NeGD) in Nov 2026.
// Admins can edit, reorder, hide or add links from Admin → ಕೊಂಡಿಗಳು.
import { GovernmentLink } from '../../db/models';
import { connectDb } from '../../lib/db';
import { logger } from '../../lib/logger';

type Def = { title: string; url: string; description: string; category: 'STATE' | 'CENTRAL'; featured?: boolean };

export const DEFAULT_GOV_LINKS: Def[] = [
  // Karnataka
  { title: 'ಸೇವಾ ಸಿಂಧು · Seva Sindhu', url: 'https://sevasindhu.karnataka.gov.in', description: 'Karnataka citizen services: certificates, schemes, applications', category: 'STATE', featured: true },
  { title: 'ನಾಡಕಚೇರಿ · Nadakacheri (AJSK)', url: 'https://nadakacheri.karnataka.gov.in', description: 'Caste, income, residence certificates', category: 'STATE', featured: true },
  { title: 'ಆಹಾರ · Ahara (Ration card)', url: 'https://ahara.karnataka.gov.in', description: 'Ration card: new card, status, e-services', category: 'STATE', featured: true },
  { title: 'ಭೂಮಿ · Bhoomi land records', url: 'https://landrecords.karnataka.gov.in', description: 'RTC (Pahani), mutation status, i-RTC', category: 'STATE', featured: true },
  { title: 'ಫ್ರೂಟ್ಸ್ · FRUITS (Farmer ID)', url: 'https://fruits.karnataka.gov.in', description: 'Farmer registration & FID', category: 'STATE', featured: true },
  // Government of India
  { title: 'ಆಧಾರ್ · myAadhaar (UIDAI)', url: 'https://myaadhaar.uidai.gov.in', description: 'Aadhaar update, download, appointment', category: 'CENTRAL', featured: true },
  { title: 'ಪ್ಯಾನ್ · PAN (Income Tax e-filing)', url: 'https://www.incometax.gov.in', description: 'Instant e-PAN, link PAN with Aadhaar', category: 'CENTRAL', featured: true },
  { title: 'ಡಿಜಿಟಲ್ ಸೇವಾ · CSC Digital Seva', url: 'https://digitalseva.csc.gov.in', description: 'CSC services portal', category: 'CENTRAL', featured: true },
  { title: 'ಇ-ಶ್ರಮ್ · e-Shram', url: 'https://eshram.gov.in', description: 'Unorganised workers registration', category: 'CENTRAL' },
  { title: 'ಪಿಎಂ-ಕಿಸಾನ್ · PM-KISAN', url: 'https://pmkisan.gov.in', description: 'Farmer income support: status, eKYC', category: 'CENTRAL' },
  { title: 'ಪರಿವಹನ್ · Parivahan', url: 'https://parivahan.gov.in', description: 'Driving licence and vehicle services', category: 'CENTRAL' },
  { title: 'ಪಾಸ್‌ಪೋರ್ಟ್ ಸೇವಾ · Passport Seva', url: 'https://www.passportindia.gov.in', description: 'Passport applications and appointments', category: 'CENTRAL' },
  { title: 'ಮತದಾರರ ಸೇವೆ · Voter services (ECI)', url: 'https://voters.eci.gov.in', description: 'Voter ID: new, correction, search', category: 'CENTRAL' },
];

/** Insert the defaults if there is no working link yet. Safe to call on every start. */
export async function ensureDefaultGovLinks(): Promise<number> {
  await connectDb();
  const working = await GovernmentLink.countDocuments({ url: { $type: 'string', $ne: '' } });
  if (working > 0) return 0;
  await GovernmentLink.insertMany(
    DEFAULT_GOV_LINKS.map((d, i) => ({ ...d, featured: d.featured ?? false, sortOrder: i * 10, isActive: true })),
  );
  logger.info(`loaded ${DEFAULT_GOV_LINKS.length} default government portal links`);
  return DEFAULT_GOV_LINKS.length;
}
