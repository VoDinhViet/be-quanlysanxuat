import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { clientGroups } from '../schemas/client-groups';

const CLIENT_GROUPS = [
  {
    code: 'STRATEGIC',
    name: 'Chiến lược',
    description: 'Khách hàng chiến lược, ưu tiên cao',
  },
  { code: 'REGULAR', name: 'Thường', description: 'Khách hàng thường' },
  { code: 'POTENTIAL', name: 'Tiềm năng', description: 'Khách hàng tiềm năng' },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedClientGroups(db);
  } finally {
    await client.end();
  }
}

export async function seedClientGroups(
  db: ReturnType<typeof drizzle<typeof schema>>,
) {
  for (const group of CLIENT_GROUPS) {
    const existing = await db.query.clientGroups.findFirst({
      where: eq(clientGroups.code, group.code),
    });

    if (existing) {
      console.log(`Client group "${group.code}" already exists. Skipping.`);
      continue;
    }

    await db.insert(clientGroups).values(group);
    console.log(`Client group "${group.code}" (${group.name}) created.`);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed client groups:', error);
      process.exit(1);
    });
}
