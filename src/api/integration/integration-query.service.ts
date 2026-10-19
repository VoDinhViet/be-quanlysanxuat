import {
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';

import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { AllConfigType } from '../../config/config.type';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import type { DateRangeReqDto } from './dto/integration-common.dto';
import { IntegrationResultResDto } from './dto/integration-common.dto';

// Một lần gọi không trả quá ngần này dòng, kể cả tool không có LIMIT riêng
const MAX_ROWS = 1000;
// Mã lỗi Postgres khi vượt `statement_timeout`
const QUERY_CANCELED_CODE = '57014';

// "Hôm nay" theo giờ Việt Nam (máy chủ DB chạy UTC): một định nghĩa cho mọi truy vấn, tránh lệch ngày
export const TODAY = sql.raw("(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date");

export function whereClause(conditions: SQL[]): SQL {
  if (conditions.length === 0) {
    return sql``;
  }
  return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
}

/** Khoảng ngày gồm cả ngày cuối (so với đầu ngày kế tiếp). `column` là tên cột cố định trong
 * code, không bao giờ lấy từ request. */
export function dateRangeConditions(
  column: SQL,
  range: DateRangeReqDto,
): SQL[] {
  if (range.startDate && range.endDate && range.endDate < range.startDate) {
    throw new UnprocessableEntityException('endDate is before startDate');
  }
  const conditions: SQL[] = [];
  if (range.startDate) {
    conditions.push(sql`${column} >= ${range.startDate}::date`);
  }
  if (range.endDate) {
    conditions.push(sql`${column} < ${range.endDate}::date + 1`);
  }
  return conditions;
}

/** So khớp cột enum với chuỗi từ request qua `::text`: giá trị lạ cho kết quả rỗng thay vì lỗi
 * `invalid input value for enum`. */
export function equalsText(column: AnyColumn | SQL, value: string): SQL {
  return sql`${column}::text = ${value}`;
}

export function inTexts(column: AnyColumn | SQL, values: string[]): SQL {
  return sql`${column}::text IN (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}

// Postgres.js trả bigint/numeric dạng chuỗi và date dạng Date; bảng kết quả chỉ chứa số và chuỗi
function toCell(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}

/**
 * Chạy một truy vấn đọc-chỉ cho nhóm `/integration`. Mọi câu SQL do code ERP dựng từ mẫu cố
 * định với tham số đã kiểm; lớp này thêm giao dịch READ ONLY, timeout và giới hạn dòng, rồi ghi
 * một dòng nhật ký mỗi lần gọi (tool, số dòng, thời gian; không ghi giá trị tham số hay kết quả).
 */
@Injectable()
export class IntegrationQueryService {
  private readonly logger = new Logger(IntegrationQueryService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  run(
    toolName: string,
    columns: string[],
    query: SQL,
  ): Promise<IntegrationResultResDto> {
    return this.query(toolName, columns, (tx) => tx.execute(query));
  }

  /**
   * Chạy truy vấn dựng bằng Drizzle trong giao dịch READ ONLY. `columns` là hợp đồng với bên gọi
   * và phải trùng khoá của câu `select`, nên kiểu `Row` suy ra từ `select` bắt lỗi lệch tên cột.
   */
  async query<Row extends Record<string, unknown>>(
    toolName: string,
    columns: Array<keyof Row & string>,
    buildQuery: (tx: DbTransaction) => PromiseLike<Iterable<Row>>,
  ): Promise<IntegrationResultResDto> {
    const timeoutMs = this.configService.getOrThrow(
      'integration.queryTimeoutMs',
      { infer: true },
    );
    const startedAt = Date.now();

    try {
      const fetchedRows = Array.from(
        await this.db.transaction(async (tx) => {
          await tx.execute(sql`SET TRANSACTION READ ONLY`);
          await tx.execute(
            sql.raw(`SET LOCAL statement_timeout = ${timeoutMs}`),
          );
          return buildQuery(tx);
        }),
      );

      const isTruncated = fetchedRows.length > MAX_ROWS;
      const resultRows = fetchedRows
        .slice(0, MAX_ROWS)
        .map((fetchedRow) =>
          columns.map((column) => toCell(fetchedRow[column])),
        );
      this.logger.log(
        `integration_query tool=${toolName} rows=${resultRows.length} truncated=${isTruncated} elapsedMs=${Date.now() - startedAt}`,
      );
      return { columns, rows: resultRows, truncated: isTruncated };
    } catch (error) {
      const code = extractPostgresError(error)?.code;
      this.logger.warn(
        `integration_query_failed tool=${toolName} code=${code ?? 'unknown'} elapsedMs=${Date.now() - startedAt}`,
      );
      if (code === QUERY_CANCELED_CODE) {
        throw new GatewayTimeoutException();
      }
      throw error;
    }
  }
}
