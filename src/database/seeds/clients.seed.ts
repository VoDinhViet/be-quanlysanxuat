import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { asc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { seed } from 'drizzle-seed';
import postgres from 'postgres';

import * as schema from '../schemas';
import { clientGroups } from '../schemas/clients/client-groups';
import { clientContacts } from '../schemas/clients/client-contacts';
import { clients } from '../schemas/clients/clients';
import { credentials } from '../schemas/identity-access/credentials';
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

// drizzle-seed's own `uuid` generator forces the version nibble to `4` but leaves the variant
// nibble fully random instead of constraining it to 8/9/a/b, so ~75% of its output fails strict
// RFC4122 validation (e.g. backend's `@IsUUID()` on create-order's clientId). Override `id` with
// real `crypto.randomUUID()` values instead of letting drizzle-seed generate them.
const CLIENT_IDS = Array.from({ length: CLIENT_COUNT }, () =>
  crypto.randomUUID(),
);

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
    // Backfill: earlier runs (or a `drizzle-seed` contact count that landed on 0) may have left
    // a seeded client without any contact, or without exactly one primary — fix both regardless
    // of the skip above.
    await ensureClientContacts(db);
    await ensurePrimaryContact(db);
    return;
  }

  const groups = await db.query.clientGroups.findMany({
    where: inArray(clientGroups.code, CLIENT_GROUP_CODES),
    columns: { id: true },
  });
  const groupIds = groups.map((g) => g.id);

  const admin = await db.query.credentials.findFirst({
    where: eq(credentials.username, 'admin'),
    columns: { userId: true },
  });
  const createdByIds = admin ? [admin.userId] : [];

  await seed(db, { clients }).refine((f) => ({
    clients: {
      count: CLIENT_COUNT,
      columns: {
        id: f.valuesFromArray({ values: CLIENT_IDS, isUnique: true }),
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
    },
  }));

  // Contacts are inserted deterministically below instead of via `drizzle-seed`'s `with:` —
  // that mechanism can't guarantee every client gets at least one contact, nor control which
  // one is primary (see .claude/rules/database.md, "Seeds" section).
  await ensureClientContacts(db);
  await ensurePrimaryContact(db);

  console.log(`Seeded ${CLIENT_COUNT} clients (with contacts).`);
}

/**
 * Ensures every seeded client (KH0001..KH00{CLIENT_COUNT}) has at least one contact, with
 * exactly one marked `isPrimary`.
 *
 * Rules:
 * - Idempotent: only inserts for clients that currently have zero contacts, so re-running
 *   (including as a backfill on an already-seeded database) is safe.
 * - Scoped to `CLIENT_CODES` on purpose — DATABASE_URL points at a shared dev database, so this
 *   must never touch real clients created by users.
 */
async function ensureClientContacts(db: SeedDatabase) {
  const seeded = await db.query.clients.findMany({
    where: inArray(clients.code, CLIENT_CODES),
    columns: { id: true, code: true },
    orderBy: asc(clients.code),
    with: { contacts: { columns: { id: true }, limit: 1 } },
  });

  const missing = seeded.filter((c) => c.contacts.length === 0);

  if (missing.length === 0) {
    console.log('Every seeded client already has at least one contact.');
    return;
  }

  const rows = missing.flatMap((client, index) => {
    const contactCount = index % 4 === 0 ? 2 : 1;

    return Array.from({ length: contactCount }, (_, k) => ({
      clientId: client.id,
      name: CONTACT_NAMES[(index * 2 + k) % CONTACT_NAMES.length],
      position: CONTACT_POSITIONS[(index + k) % CONTACT_POSITIONS.length],
      phoneNumber: `09${String(10000000 + index * 2 + k).padStart(8, '0')}`,
      email: `lienhe${index}${k > 0 ? `.${k}` : ''}@example.com`,
      note: null,
      // Exactly one primary contact per client: always the first one generated.
      isPrimary: k === 0,
    }));
  });

  await db.insert(clientContacts).values(rows);

  console.log(
    `Added ${rows.length} contact(s) for ${missing.length} client(s) missing one.`,
  );
}

/**
 * Fixes the primary-contact invariant (exactly one `isPrimary` contact per client) for seeded
 * clients whose contacts predate this rule — e.g. rows generated by the old `drizzle-seed`
 * `with:` block, which assigned `isPrimary` via an independent 70/30 random weight per contact
 * and could leave a client with zero or multiple primaries.
 *
 * Rules:
 * - Idempotent: only clients whose primary count is already wrong get touched; the
 *   earliest-created contact is promoted to primary and every other contact is demoted.
 * - Scoped to `CLIENT_CODES`, same reason as `ensureClientContacts`.
 */
async function ensurePrimaryContact(db: SeedDatabase) {
  const seeded = await db.query.clients.findMany({
    where: inArray(clients.code, CLIENT_CODES),
    columns: { id: true },
    with: {
      contacts: {
        columns: { id: true, isPrimary: true },
        orderBy: asc(clientContacts.createdAt),
      },
    },
  });

  const toFix = seeded.filter(
    (c) => c.contacts.filter((contact) => contact.isPrimary).length !== 1,
  );

  if (toFix.length === 0) {
    console.log('Every seeded client already has exactly one primary contact.');
    return;
  }

  for (const client of toFix) {
    const [firstContact, ...restContacts] = client.contacts;
    const wronglyPrimaryIds = restContacts
      .filter((c) => c.isPrimary)
      .map((c) => c.id);

    if (!firstContact.isPrimary) {
      await db
        .update(clientContacts)
        .set({ isPrimary: true })
        .where(eq(clientContacts.id, firstContact.id));
    }
    if (wronglyPrimaryIds.length > 0) {
      await db
        .update(clientContacts)
        .set({ isPrimary: false })
        .where(inArray(clientContacts.id, wronglyPrimaryIds));
    }
  }

  console.log(`Fixed primary contact for ${toFix.length} client(s).`);
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
