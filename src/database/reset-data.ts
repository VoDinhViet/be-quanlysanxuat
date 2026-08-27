import { existsSync, readdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import postgres from 'postgres';

/**
 * Wipe toàn bộ dữ liệu ở DB dev, chỉ giữ lại đúng một tài khoản đăng nhập (mặc định `admin`) cùng
 * role/department/position của nó và toàn bộ `countries`. Công cụ vận hành một lần, không phải
 * seed (`.claude/rules/seeds.md` chỉ áp cho `src/database/seeds/`).
 *
 * Mặc định dry-run — chỉ in ra sẽ xoá gì, không ghi. Cần `--yes` để chạy thật.
 */
const KEEP_TABLES = [
  'users',
  'credentials',
  'roles',
  'departments',
  'positions',
  'countries',
  'files',
] as const;

const ADMIN_USERNAME = process.env.RESET_ADMIN_USERNAME || 'admin';

interface AdminRow {
  credentialId: string;
  userId: string;
  roleId: string | null;
  departmentId: string;
  positionId: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    yes: args.includes('--yes'),
    keepUploads: args.includes('--keep-uploads'),
  };
}

function maskedTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function resolveAdmin(sql: postgres.Sql): Promise<AdminRow | null> {
  const rows = await sql<AdminRow[]>`
    SELECT
      c.id AS "credentialId",
      u.id AS "userId",
      c.role_id AS "roleId",
      u.department_id AS "departmentId",
      u.position_id AS "positionId"
    FROM credentials c
    JOIN users u ON u.id = c.user_id
    WHERE lower(c.username) = lower(${ADMIN_USERNAME})
  `;
  return rows[0] ?? null;
}

async function listWipeTables(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ tableName: string }[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '\\_\\_drizzle%'
  `;
  return rows
    .map((row) => row.tableName)
    .filter((name) => !(KEEP_TABLES as readonly string[]).includes(name));
}

async function countRows(sql: postgres.Sql, table: string): Promise<number> {
  const rows = await sql<
    { count: string }[]
  >`SELECT count(*) FROM ${sql(table)}`;
  return Number(rows[0].count);
}

function resolveUploadDir(): string {
  return process.env.UPLOAD_DIR
    ? resolve(process.cwd(), process.env.UPLOAD_DIR)
    : join(process.cwd(), 'uploads');
}

function uploadDirSizeLabel(dir: string): string {
  if (!existsSync(dir)) return '(không tồn tại)';
  const entries = readdirSync(dir);
  return `${entries.length} mục ở cấp gốc`;
}

function clearUploadDir(dir: string): void {
  const cwd = resolve(process.cwd());
  const target = resolve(dir);
  // Chỉ xoá khi chắc chắn đường dẫn nằm trong repo và tên thư mục đúng là "uploads" — tránh
  // rm nhầm khi UPLOAD_DIR bị set thành một đường dẫn bất thường.
  if (
    target !== join(cwd, 'uploads') ||
    !target.startsWith(cwd) ||
    target === cwd
  ) {
    console.warn(
      `Bỏ qua xoá uploads — đường dẫn "${target}" không khớp quy ước an toàn, hãy xoá tay.`,
    );
    return;
  }
  if (!existsSync(target)) return;
  for (const entry of readdirSync(target)) {
    rmSync(join(target, entry), { recursive: true, force: true });
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(
      'NODE_ENV=production — script này chỉ chạy trên dev. Dừng lại, không mở kết nối.',
    );
    process.exit(1);
  }

  const { yes, keepUploads } = parseArgs();
  const target = maskedTarget(databaseUrl);
  console.log(`Target DB: ${target}`);
  console.log(
    yes
      ? 'Chế độ: CHẠY THẬT (--yes)'
      : 'Chế độ: DRY-RUN (thêm --yes để chạy thật)',
  );

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const admin = await resolveAdmin(sql);
    if (!admin) {
      console.error(
        `Không tìm thấy credential "${ADMIN_USERNAME}" — dừng lại, không xoá gì để tránh mất` +
          ' hết đường đăng nhập.',
      );
      process.exit(1);
    }
    console.log(
      `Giữ lại: credential "${ADMIN_USERNAME}" (userId=${admin.userId}).`,
    );

    const wipeTables = await listWipeTables(sql);
    console.log(`\nBảng sẽ TRUNCATE (${wipeTables.length}):`);
    for (const table of wipeTables) {
      const count = await countRows(sql, table);
      if (count > 0) console.log(`  ${table}: ${count} dòng`);
    }

    const filesCount = await countRows(sql, 'files');
    console.log(
      `\nfiles: ${filesCount} dòng sẽ xoá (DELETE, không TRUNCATE — xem plan).`,
    );

    const uploadDir = resolveUploadDir();
    console.log(
      `Thư mục upload: ${uploadDir} — ${
        keepUploads
          ? 'sẽ GIỮ LẠI bytes (--keep-uploads)'
          : `sẽ xoá nội dung (${uploadDirSizeLabel(uploadDir)})`
      }`,
    );

    if (!yes) {
      console.log(
        '\nDry-run xong — không có gì bị xoá. Chạy lại kèm --yes để thực thi.',
      );
      return;
    }

    await sql.begin(async (tx) => {
      if (wipeTables.length > 0) {
        await tx.unsafe(
          `TRUNCATE TABLE ${wipeTables.map((t) => `"${t}"`).join(', ')} CASCADE`,
        );
      }

      await tx`DELETE FROM files`;
      await tx`DELETE FROM credentials WHERE id <> ${admin.credentialId}`;
      await tx`DELETE FROM users WHERE id <> ${admin.userId}`;
      if (admin.roleId) {
        await tx`DELETE FROM roles WHERE id <> ${admin.roleId}`;
      } else {
        await tx`DELETE FROM roles`;
      }
      await tx`DELETE FROM positions WHERE id <> ${admin.positionId}`;
      await tx`DELETE FROM departments WHERE id <> ${admin.departmentId}`;

      await tx`
        UPDATE users
        SET created_by = NULL, avatar_file_id = NULL, deleted_at = NULL
        WHERE id = ${admin.userId}
      `;
    });

    if (!keepUploads) {
      clearUploadDir(uploadDir);
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
      console.error('Failed to reset data:', error);
      process.exit(1);
    });
}
