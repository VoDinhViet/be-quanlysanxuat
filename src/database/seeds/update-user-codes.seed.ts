import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schemas';
import { users } from '../schemas/users';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    console.log('Fetching all users to update codes...');
    const allUsers = await db.query.users.findMany({
      orderBy: (users, { asc }) => [asc(users.createdAt)],
    });

    console.log(`Found ${allUsers.length} users.`);

    let updatedCount = 0;
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      
      // Only update if the user does not have a code currently
      if (!user.code) {
        const code = `US${String(i + 1).padStart(4, '0')}`;
        console.log(`Updating user ${user.email} with code ${code}...`);
        await db.update(users).set({ code }).where(eq(users.id, user.id));
        updatedCount++;
      } else {
        console.log(`User ${user.email} already has code: ${user.code}. Skipping.`);
      }
    }

    console.log(`Successfully updated ${updatedCount} users.`);
  } catch (error) {
    console.error('Failed to update user codes:', error);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
