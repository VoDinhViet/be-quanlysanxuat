import { existsSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import postgres from 'postgres';

/**
 * Wipe chứng từ giao dịch (đơn hàng, LSX, kho, mua hàng, QC) trên một DB đang chạy thật, giữ
 * nguyên toàn bộ master data (items/BOM/routing, clients, suppliers, units, operations,
 * warehouses, QC AQL, countries) và toàn bộ tài khoản đăng nhập. Khác `reset-data.ts` (chỉ dùng
 * cho dev, wipe gần hết trừ 1 admin): công cụ này CHO PHÉP chạy trên `NODE_ENV=production`, nên
 * đổi hẳn cơ chế an toàn — hai danh sách bảng tường minh + fail-closed thay vì suy ra động, và
 * TRUNCATE không CASCADE để Postgres tự chặn nếu thiếu một bảng giao dịch nào đó.
 *
 * Mặc định dry-run — chỉ in ra sẽ xoá gì, không ghi. Cần cả `--yes` và `--confirm-target` khớp
 * đúng `DATABASE_URL` để chạy thật.
 */

const KEEP_TABLES = [
  'users',
  'credentials',
  'roles',
  'departments',
  'positions',
  'countries',
  'files',
  'document_sequences',
  'units',
  'unit_scopes',
  'operations',
  'warehouses',
  'client_groups',
  'clients',
  'client_contacts',
  'supplier_groups',
  'suppliers',
  'supplier_files',
  'supplier_representatives',
  'supplier_payment_info',
  'items',
  'item_files',
  'boms',
  'bom_items',
  'bom_operations',
  'routings',
  'routing_operations',
  'qc_aql_rules',
  'qc_aql_plans',
] as const;

const WIPE_TABLES = [
  // Orders
  'orders',
  'order_items',
  'order_files',
  'order_payments',
  // Purchase requests
  'purchase_requests',
  'purchase_request_items',
  // Purchasing
  'purchase_quotations',
  'purchase_quotation_items',
  'purchase_quotation_item_allocations',
  'purchase_quotation_item_suppliers',
  'purchase_orders',
  'purchase_order_items',
  'payment_requests',
  // Inventory
  'inventory_receipts',
  'inventory_receipt_items',
  'inventory_issues',
  'inventory_issue_items',
  'inventory_requisitions',
  'inventory_requisition_items',
  'outbound_orders',
  'outbound_order_items',
  'inventory_transactions',
  'inventory_balances',
  'supplier_returns',
  'supplier_return_files',
  'outsourcing_orders',
  'outsourcing_order_items',
  'outsourcing_receipts',
  'outsourcing_receipt_items',
  // Production
  'production_orders',
  'production_order_items',
  'production_order_logs',
  'production_jobs',
  'production_job_items',
  'production_job_units',
  'production_job_bom_items',
  'production_job_operations',
  'production_job_operation_reports',
  'production_job_operation_report_files',
  'production_job_issues',
  'production_job_notes',
  // Quality
  'qc_requests',
  'qc_inspections',
  'qc_files',
] as const;

// Loại chứng từ cấp mã cho master data đang giữ — reset counter về 0 sẽ đâm vào mã đang sống
// ngay lần tạo tiếp theo (`items` dùng partial unique index `uq_items_code_active`, và
// `document-sequences-bootstrap.seed.ts` không phủ ITEM_RM/ITEM_FG_WIP/WAREHOUSE nên không có
// đường phục hồi tự động).
const KEEP_DOCUMENT_TYPES = [
  'ITEM_RM',
  'ITEM_FG_WIP',
  'CLIENT',
  'SUPPLIER',
  'USER',
  'WAREHOUSE',
] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const confirmTargetArg = args.find((arg) =>
    arg.startsWith('--confirm-target='),
  );
  return {
    yes: args.includes('--yes'),
    keepUploads: args.includes('--keep-uploads'),
    confirmTarget: confirmTargetArg
      ? confirmTargetArg.slice('--confirm-target='.length)
      : undefined,
  };
}

function maskedTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function ensureKnownTables(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ tableName: string }[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '\\_\\_drizzle%'
  `;
  const known = new Set<string>([...KEEP_TABLES, ...WIPE_TABLES]);
  const unknown = rows
    .map((row) => row.tableName)
    .filter((name) => !known.has(name));
  if (unknown.length > 0) {
    console.error(
      `\nPhát hiện bảng chưa được phân loại vào KEEP_TABLES/WIPE_TABLES: ${unknown.join(', ')}`,
    );
    console.error(
      'Dừng lại — cập nhật src/database/reset-transactions.ts trước khi chạy tiếp.',
    );
    process.exit(1);
  }
}

async function countRows(sql: postgres.Sql, table: string): Promise<number> {
  const rows = await sql<
    { count: string }[]
  >`SELECT count(*) FROM ${sql(table)}`;
  return Number(rows[0].count);
}

interface FilesForeignKey {
  tableName: string;
  columnName: string;
}

/**
 * Mọi FK đang trỏ tới `files.id` từ một bảng trong KEEP_TABLES — suy từ `pg_constraint` thay vì
 * gõ tay từng cột, để không lặp lại bẫy mà `FilesCleanupService` tự cảnh báo (thêm module mới,
 * quên một tham chiếu, xoá nhầm data sống).
 */
async function listFilesForeignKeys(
  sql: postgres.Sql,
): Promise<FilesForeignKey[]> {
  const rows = await sql<FilesForeignKey[]>`
    SELECT
      src_cls.relname AS "tableName",
      src_att.attname AS "columnName"
    FROM pg_constraint con
    JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
    JOIN pg_class src_cls ON src_cls.oid = con.conrelid
    JOIN pg_attribute src_att
      ON src_att.attrelid = con.conrelid AND src_att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND ref_cls.relname = 'files'
      AND src_cls.relname = ANY(${sql.array([...KEEP_TABLES])})
  `;
  return rows;
}

async function countOrphanFiles(
  sql: postgres.Sql,
  foreignKeys: FilesForeignKey[],
): Promise<number> {
  if (foreignKeys.length === 0) return countRows(sql, 'files');
  const notExistsClauses = foreignKeys.map(
    (fk) => sql`
      NOT EXISTS (
        SELECT 1 FROM ${sql(fk.tableName)}
        WHERE ${sql(fk.tableName)}.${sql(fk.columnName)} = files.id
      )
    `,
  );
  const rows = await sql<{ count: string }[]>`
    SELECT count(*) FROM files WHERE ${notExistsClauses.reduce(
      (acc, clause) => sql`${acc} AND ${clause}`,
    )}
  `;
  return Number(rows[0].count);
}

async function countKeepDocumentSequences(sql: postgres.Sql): Promise<{
  reset: number;
  kept: number;
}> {
  const [resetRow] = await sql<{ count: string }[]>`
    SELECT count(*) FROM document_sequences
    WHERE document_type NOT IN ${sql(KEEP_DOCUMENT_TYPES)}
  `;
  const [keptRow] = await sql<{ count: string }[]>`
    SELECT count(*) FROM document_sequences
    WHERE document_type IN ${sql(KEEP_DOCUMENT_TYPES)}
  `;
  return { reset: Number(resetRow.count), kept: Number(keptRow.count) };
}

function resolveUploadDir(): string {
  return process.env.UPLOAD_DIR
    ? resolve(process.cwd(), process.env.UPLOAD_DIR)
    : join(process.cwd(), 'uploads');
}

function deleteUploadFile(uploadDir: string, storageKey: string): void {
  const cwd = resolve(process.cwd());
  const target = resolve(uploadDir, storageKey);
  // Cùng quy ước an toàn với `clearUploadDir` trong reset-data.ts — chỉ xoá khi đường dẫn nằm
  // trong đúng thư mục upload, tránh path traversal nếu storageKey bất thường.
  if (
    !target.startsWith(resolve(uploadDir) + '/') ||
    !uploadDir.startsWith(cwd)
  ) {
    console.warn(`Bỏ qua xoá byte — đường dẫn "${target}" bất thường.`);
    return;
  }
  rmSync(target, { force: true });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const { yes, keepUploads, confirmTarget } = parseArgs();
  const target = maskedTarget(databaseUrl);
  console.log(`Target DB: ${target}`);
  console.log(
    yes
      ? 'Chế độ: CHẠY THẬT (--yes)'
      : 'Chế độ: DRY-RUN (thêm --yes để chạy thật)',
  );

  if (yes && confirmTarget !== target) {
    console.error(
      `\n--confirm-target không khớp đích thật ("${confirmTarget ?? '(chưa truyền)'}" ` +
        `!= "${target}"). Dừng lại để tránh chạy nhầm DB.`,
    );
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await ensureKnownTables(sql);

    console.log(`\nBảng sẽ TRUNCATE (${WIPE_TABLES.length}):`);
    for (const table of WIPE_TABLES) {
      const count = await countRows(sql, table);
      if (count > 0) console.log(`  ${table}: ${count} dòng`);
    }

    const filesForeignKeys = await listFilesForeignKeys(sql);
    const orphanFilesCount = await countOrphanFiles(sql, filesForeignKeys);
    console.log(
      `\nfiles: ${orphanFilesCount} dòng mồ côi sẽ xoá (không còn tham chiếu từ ` +
        `${KEEP_TABLES.join(', ')} sau khi TRUNCATE).`,
    );

    const documentSequences = await countKeepDocumentSequences(sql);
    console.log(
      `document_sequences: ${documentSequences.reset} dòng sẽ reset (DELETE), ` +
        `${documentSequences.kept} dòng giữ nguyên (${KEEP_DOCUMENT_TYPES.join(', ')}).`,
    );

    console.log('\nSố dòng hiện tại các bảng giữ (đối chiếu sau khi chạy):');
    for (const table of KEEP_TABLES) {
      console.log(`  ${table}: ${await countRows(sql, table)}`);
    }

    const uploadDir = resolveUploadDir();
    console.log(
      `\nThư mục upload: ${uploadDir} — bytes của các file mồ côi ở trên sẽ ${
        keepUploads ? 'ĐƯỢC GIỮ (--keep-uploads)' : 'bị xoá'
      }.`,
    );

    if (!yes) {
      console.log(
        '\nDry-run xong — không có gì bị xoá. Chạy lại kèm --yes --confirm-target=' +
          `"${target}" để thực thi.`,
      );
      return;
    }

    const deletedFiles = await sql.begin(async (tx) => {
      if (WIPE_TABLES.length > 0) {
        // Không CASCADE: nếu một bảng giao dịch bị thiếu trong WIPE_TABLES, Postgres từ chối
        // TRUNCATE thay vì âm thầm kéo nó vào — an toàn hơn tự sắp thứ tự ~14 FK restrict giữa
        // các bảng giao dịch.
        await tx.unsafe(
          `TRUNCATE TABLE ${WIPE_TABLES.map((t) => `"${t}"`).join(', ')}`,
        );
      }

      const orphanFiles = await tx<{ id: string; storageKey: string }[]>`
        SELECT id, storage_key AS "storageKey" FROM files
        WHERE ${
          filesForeignKeys.length > 0
            ? filesForeignKeys
                .map(
                  (fk) => tx`
                    NOT EXISTS (
                      SELECT 1 FROM ${tx(fk.tableName)}
                      WHERE ${tx(fk.tableName)}.${tx(fk.columnName)} = files.id
                    )
                  `,
                )
                .reduce((acc, clause) => tx`${acc} AND ${clause}`)
            : tx`true`
        }
      `;
      if (orphanFiles.length > 0) {
        await tx`DELETE FROM files WHERE id IN ${tx(orphanFiles.map((f) => f.id))}`;
      }

      await tx`
        DELETE FROM document_sequences WHERE document_type NOT IN ${tx(KEEP_DOCUMENT_TYPES)}
      `;

      return orphanFiles;
    });

    if (deletedFiles.length > 0) {
      const listPath = resolve(process.cwd(), 'deleted-storage-keys.txt');
      writeFileSync(
        listPath,
        deletedFiles.map((f) => f.storageKey).join('\n') + '\n',
      );
      console.log(
        `\nĐã ghi ${deletedFiles.length} storage_key vào ${listPath}.`,
      );

      if (!keepUploads) {
        if (existsSync(uploadDir)) {
          for (const file of deletedFiles) {
            deleteUploadFile(uploadDir, file.storageKey);
          }
          console.log(`Đã xoá byte trong ${uploadDir}.`);
        } else {
          console.warn(
            `\nThư mục upload "${uploadDir}" không tồn tại trên máy này — bytes CHƯA được xoá. ` +
              `Copy ${listPath} sang server chứa thư mục upload thật và xoá tay.`,
          );
        }
      }
    }

    console.log('\nĐã xoá xong. Số dòng còn lại ở các bảng giữ:');
    for (const table of KEEP_TABLES) {
      console.log(`  ${table}: ${await countRows(sql, table)}`);
    }
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Failed to reset transaction data:', error);
      process.exit(1);
    });
}
