import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { seed } from 'drizzle-seed';
import postgres from 'postgres';

import * as schema from '../schemas';
import { clientGroups } from '../schemas/client-groups';
import { clientContacts, clients } from '../schemas/clients';
import { credentials } from '../schemas/credentials';
import { seedClientGroups } from './client-groups.seed';

const CLIENT_COUNT = 50;

// Vietnamese-flavored fake data pools (drizzle-seed's built-in generators have no VN locale —
// see .claude/rules/database.md, "Seeds" section).
const BUSINESS_TYPES = [
  'Công ty TNHH',
  'Công ty Cổ phần',
  'Công ty TNHH MTV',
  'DNTN',
  'Hộ kinh doanh',
];
const INDUSTRIES = [
  'Cơ khí',
  'Xây dựng',
  'Nội thất',
  'Thép',
  'Nhôm kính',
  'In ấn',
  'Bao bì',
  'Thực phẩm',
  'Điện tử',
  'Vận tải',
  'Thương mại',
  'Dịch vụ',
  'Sản xuất',
  'Xuất nhập khẩu',
  'Công nghệ',
];
const SUFFIXES = [
  'Thành Công',
  'Phát Đạt',
  'Hưng Thịnh',
  'Đại Phát',
  'Minh Long',
  'Á Châu',
  'Việt Tiến',
  'Nam Việt',
  'Hoàng Gia',
  'An Phát',
  'Tân Thành',
  'Đông Á',
  'Sài Gòn',
  'Thăng Long',
  'Phú Quý',
  'Kim Long',
  'Bình Minh',
  'Sao Việt',
  'Đất Việt',
  'Long Thành',
];
const PROVINCES = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Đà Nẵng',
  'Hải Phòng',
  'Cần Thơ',
  'Bình Dương',
  'Đồng Nai',
  'Bắc Ninh',
  'Hưng Yên',
  'Long An',
];
const VN_FAMILY_GIVEN = [
  'Nguyễn Văn',
  'Trần Thị',
  'Lê Văn',
  'Phạm Thị',
  'Hoàng Văn',
  'Vũ Thị',
  'Đặng Văn',
  'Bùi Thị',
  'Đỗ Văn',
  'Ngô Thị',
];
const VN_GIVEN_LAST = [
  'An',
  'Bình',
  'Cường',
  'Dũng',
  'Giang',
  'Hà',
  'Hùng',
  'Khang',
  'Lan',
  'Minh',
  'Nam',
  'Oanh',
  'Phúc',
  'Quân',
  'Sơn',
  'Thảo',
  'Uyên',
  'Việt',
];
const CONTACT_POSITIONS = [
  'Giám đốc',
  'Phó giám đốc',
  'Kế toán trưởng',
  'Trưởng phòng mua hàng',
  'Trưởng phòng kinh doanh',
];

// 60 combinations > 50 needed: (industry, suffix) pairs are distinct for i < LCM(15, 20) = 60.
const COMPANY_NAMES = Array.from(
  { length: 60 },
  (_, i) =>
    `${BUSINESS_TYPES[i % 5]} ${INDUSTRIES[i % 15]} ${SUFFIXES[i % 20]}`,
);
const ADDRESSES = Array.from(
  { length: 60 },
  (_, i) =>
    `${100 + i} Đường ${SUFFIXES[(i + 3) % 20]}, Quận ${(i % 10) + 1}, ${PROVINCES[i % 10]}`,
);
const CONTACT_NAMES = Array.from(
  { length: 60 },
  (_, i) => `${VN_FAMILY_GIVEN[i % 10]} ${VN_GIVEN_LAST[i % 18]}`,
);
const CLIENT_CODES = Array.from(
  { length: CLIENT_COUNT },
  (_, i) => `KH${String(i + 1).padStart(4, '0')}`,
);
const TAX_CODES = Array.from({ length: CLIENT_COUNT }, (_, i) =>
  String(1000000000 + i),
);
// Repetition-weighted pool: ~7/8 ACTIVE, 1/8 PAUSED.
const STATUSES = [
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'ACTIVE',
  'PAUSED',
];

const CLIENT_GROUP_CODES = ['STRATEGIC', 'REGULAR', 'POTENTIAL'];

type SeedDatabase = ReturnType<typeof drizzle<typeof schema>>;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedClients(db);
  } finally {
    await client.end();
  }
}

async function seedClients(db: SeedDatabase) {
  // Prerequisite: client groups must exist (clients.clientGroupId is a required FK).
  await seedClientGroups(db);

  // Idempotency gate: drizzle-seed has no per-row skip-if-exists, so gate the whole bulk insert
  // on whether it has already run once.
  const existing = await db.query.clients.findFirst({
    where: eq(clients.code, CLIENT_CODES[0]),
    columns: { id: true },
  });

  if (existing) {
    console.log(
      `Clients already seeded (found "${CLIENT_CODES[0]}"). Skipping.`,
    );
    return;
  }

  const groups = await db.query.clientGroups.findMany({
    where: inArray(clientGroups.code, CLIENT_GROUP_CODES),
    columns: { id: true },
  });
  const groupIds = groups.map((g) => g.id);

  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { id: true },
  });
  const createdByIds = admin ? [admin.id] : [];

  await seed(db, { clients, clientContacts }).refine((f) => ({
    clients: {
      count: CLIENT_COUNT,
      columns: {
        code: f.valuesFromArray({ values: CLIENT_CODES, isUnique: true }),
        name: f.valuesFromArray({ values: COMPANY_NAMES, isUnique: true }),
        clientGroupId: f.valuesFromArray({ values: groupIds }),
        taxCode: f.weightedRandom([
          {
            weight: 0.8,
            value: f.valuesFromArray({ values: TAX_CODES, isUnique: true }),
          },
          { weight: 0.2, value: f.default({ defaultValue: null }) },
        ]),
        phoneNumber: f.phoneNumber({ template: '09########' }),
        email: f.email(),
        address: f.valuesFromArray({ values: ADDRESSES }),
        note: f.default({ defaultValue: null }),
        status: f.valuesFromArray({ values: STATUSES }),
        createdBy:
          createdByIds.length > 0
            ? f.valuesFromArray({ values: createdByIds })
            : f.default({ defaultValue: null }),
        // Must force null explicitly — clients reads filter `deletedAt IS NULL`, and a random
        // non-null value here would silently make a seeded client invisible to the app.
        deletedAt: f.default({ defaultValue: null }),
      },
      with: {
        clientContacts: [
          { weight: 0.85, count: [1] },
          { weight: 0.15, count: [2] },
        ],
      },
    },
    clientContacts: {
      columns: {
        name: f.valuesFromArray({ values: CONTACT_NAMES }),
        position: f.valuesFromArray({ values: CONTACT_POSITIONS }),
        phoneNumber: f.phoneNumber({ template: '09########' }),
        email: f.email(),
        note: f.default({ defaultValue: null }),
        isPrimary: f.weightedRandom([
          { weight: 0.7, value: f.default({ defaultValue: true }) },
          { weight: 0.3, value: f.default({ defaultValue: false }) },
        ]),
      },
    },
  }));

  console.log(`Seeded ${CLIENT_COUNT} clients (with contacts).`);
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed clients:', error);
      process.exit(1);
    });
}
