import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { countries } from '../schemas/countries';

// Shortlist of common trading-partner countries for a Vietnamese manufacturing supplier network.
const COUNTRIES = [
  { code: 'VN', name: 'Việt Nam' },
  { code: 'CN', name: 'Trung Quốc' },
  { code: 'JP', name: 'Nhật Bản' },
  { code: 'KR', name: 'Hàn Quốc' },
  { code: 'TW', name: 'Đài Loan' },
  { code: 'TH', name: 'Thái Lan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IN', name: 'Ấn Độ' },
  { code: 'DE', name: 'Đức' },
  { code: 'US', name: 'Mỹ' },
  { code: 'IT', name: 'Ý' },
  { code: 'FR', name: 'Pháp' },
  { code: 'GB', name: 'Anh' },
  { code: 'NL', name: 'Hà Lan' },
  { code: 'CH', name: 'Thụy Sĩ' },
  { code: 'AU', name: 'Úc' },
  { code: 'CA', name: 'Canada' },
  { code: 'ES', name: 'Tây Ban Nha' },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedCountries(db);
  } finally {
    await client.end();
  }
}

async function seedCountries(db: ReturnType<typeof drizzle<typeof schema>>) {
  for (const country of COUNTRIES) {
    const existing = await db.query.countries.findFirst({
      where: eq(countries.code, country.code),
    });

    if (existing) {
      console.log(`Country "${country.code}" already exists. Skipping.`);
      continue;
    }

    // flagcdn.com serves flag images by ISO 3166-1 alpha-2 code — no local upload needed.
    const logoUrl = `https://flagcdn.com/w80/${country.code.toLowerCase()}.png`;

    await db.insert(countries).values({ ...country, logoUrl });
    console.log(`Country "${country.code}" (${country.name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed countries:', error);
      process.exit(1);
    });
}
