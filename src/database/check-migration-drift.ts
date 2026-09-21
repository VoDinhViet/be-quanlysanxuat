import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import * as dotenv from 'dotenv';
import postgres from 'postgres';

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

const ENVIRONMENTS = ['development', 'production'] as const;

function loadJournal(): JournalEntry[] {
  const journal = JSON.parse(
    readFileSync(join(__dirname, '../../drizzle/meta/_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] };
  return journal.entries;
}

function fileHash(tag: string): string {
  const content = readFileSync(join(__dirname, '../../drizzle', `${tag}.sql`));
  return createHash('sha256').update(content).digest('hex');
}

/**
 * `__drizzle_migrations.created_at` is not the wall-clock apply time — drizzle-kit copies it
 * straight from the migration's own `when` in `_journal.json` at generation time. So the only
 * reliable way to match a DB row to a local file is `created_at == journal[i].when`, not row
 * position — history in this repo was squashed mid-sequence at least once, which breaks any
 * constant positional offset (id/idx don't move in lockstep before and after the squash point).
 */
async function checkEnvironment(
  env: (typeof ENVIRONMENTS)[number],
  journalByWhen: Map<number, JournalEntry>,
): Promise<boolean> {
  dotenv.config({ path: `.env.${env}`, override: true });
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.log(`[${env}] no DATABASE_URL in .env.${env} — skipped.`);
    return true;
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const [{ exists: migrationsTableExists }] = await sql<
      { exists: string | null }[]
    >`select to_regclass('drizzle.__drizzle_migrations') as exists`;

    if (!migrationsTableExists) {
      console.log(`[${env}] no migrations applied yet.`);
      return true;
    }

    const applied = await sql<
      { hash: string; createdAt: string }[]
    >`select hash, created_at as "createdAt" from drizzle.__drizzle_migrations order by id asc`;

    let ok = true;
    let checked = 0;
    let unmatched = 0;

    for (const row of applied) {
      const entry = journalByWhen.get(Number(row.createdAt));
      if (!entry) {
        // Migration no longer has a local file (history squashed) — nothing to compare against.
        unmatched++;
        continue;
      }

      checked++;
      const diskHash = fileHash(entry.tag);
      if (row.hash !== diskHash) {
        ok = false;
        console.log(`[${env}] MISMATCH ${entry.tag}.sql`);
        console.log(`  DB hash:   ${row.hash}`);
        console.log(`  File hash: ${diskHash}`);
      }
    }

    if (ok) {
      console.log(`[${env}] ${checked} migration(s) checked, all match.`);
    }
    if (unmatched > 0) {
      console.log(
        `[${env}] ${unmatched} applied migration(s) have no matching local file (history squashed) — not checked.`,
      );
    }

    const pending = [...journalByWhen.keys()].filter(
      (when) => !applied.some((row) => Number(row.createdAt) === when),
    ).length;
    if (pending > 0) {
      console.log(
        `[${env}] ${pending} local migration(s) not yet applied — normal, not drift.`,
      );
    }

    return ok;
  } finally {
    await sql.end();
  }
}

async function main() {
  const journal = loadJournal();
  const journalByWhen = new Map(journal.map((entry) => [entry.when, entry]));
  let allOk = true;

  for (const env of ENVIRONMENTS) {
    const ok = await checkEnvironment(env, journalByWhen);
    allOk = allOk && ok;
  }

  if (!allOk) {
    console.error(
      '\nDrift found — a migration file was edited after some environment already applied it.' +
        ' Write a NEW migration instead of editing the old one; the environment that already ran' +
        ' it needs a manual data fix (see .claude/rules/database.md).',
    );
    process.exit(1);
  }

  console.log('\nNo drift.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to check migration drift:', error);
    process.exit(1);
  });
}
