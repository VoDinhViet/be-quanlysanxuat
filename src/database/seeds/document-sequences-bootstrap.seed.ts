import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';

/**
 * Kéo `document_sequences.currentValue` lên bằng số lớn nhất đang có trong mã hiện tại của 9 loại
 * chứng từ vừa chuyển sang sinh mã atomic (`docs/architecture.md`) — bắt buộc chạy trên một môi
 * trường đã có dữ liệu tạo bằng cơ chế đếm-rồi-cộng cũ (staging/prod sau này, hoặc dev nếu chưa
 * chạy) trước khi dùng `generateDocumentSequence(s)`, nếu không lần sinh mã atomic đầu tiên sẽ lặp
 * lại số đã dùng và vỡ unique constraint trên `code`. Idempotent (`GREATEST`, không bao giờ lùi số)
 * — an toàn chạy lại nhiều lần hoặc chạy trên môi trường đã bootstrap rồi.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedDocumentSequencesBootstrap(db);
  } finally {
    await client.end();
  }
}

async function seedDocumentSequencesBootstrap(
  db: ReturnType<typeof drizzle<typeof schema>>,
) {
  await db.transaction(async (tx) => {
    // Sáu loại đánh số phẳng, không reset theo kỳ — luôn bootstrap `year = 0` (sentinel), kể cả
    // 0 dòng khớp (giữ nguyên `currentValue` mặc định 0, vô hại).
    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'USER', 0, COALESCE(MAX(substring(code from 3)::int), 0)
      FROM users WHERE code ~ '^NV[0-9]+$'
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);

    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'SUPPLIER', 0, COALESCE(MAX(substring(code from 4)::int), 0)
      FROM suppliers WHERE code ~ '^NCC[0-9]+$'
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);

    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'ORDER', 0, COALESCE(MAX(substring(code from 3)::int), 0)
      FROM orders WHERE code ~ '^SO[0-9]+$'
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);

    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'PRODUCTION_ORDER', 0, COALESCE(MAX(substring(code from 4)::int), 0)
      FROM production_orders WHERE code ~ '^LSX[0-9]+$'
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);

    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'PRODUCTION_JOB', 0, COALESCE(MAX(substring(code from 4)::int), 0)
      FROM production_jobs WHERE code ~ '^JOB[0-9]+$'
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);

    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'PAYMENT_REQUEST', 0, COALESCE(MAX(substring(code from 6)::int), 0)
      FROM payment_requests WHERE code ~ '^YCTT-[0-9]+$'
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);

    // Hai loại reset-theo-kỳ — chỉ bootstrap những kỳ thật sự có dữ liệu (group theo kỳ rút ra từ
    // chính mã), kỳ chưa từng dùng thì để `generateDocumentSequence` tự tạo dòng mới lúc cần.
    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'OUTBOUND_ORDER', substring(code from 4 for 6)::int, MAX(substring(code from 11)::int)
      FROM outbound_orders WHERE code ~ '^DO-[0-9]{6}-[0-9]+$'
      GROUP BY substring(code from 4 for 6)
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);

    await tx.execute(sql`
      INSERT INTO document_sequences (document_type, year, current_value)
      SELECT 'SUPPLIER_RETURN', substring(code from 7 for 4)::int, MAX(substring(code from 12)::int)
      FROM supplier_returns WHERE code ~ '^PTNCC-[0-9]{4}-[0-9]+$'
      GROUP BY substring(code from 7 for 4)
      ON CONFLICT (document_type, year)
      DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)
    `);
  });

  console.log('document_sequences bootstrap done.');
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to bootstrap document_sequences:', error);
      process.exit(1);
    });
}
