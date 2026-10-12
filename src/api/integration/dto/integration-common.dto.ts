import { ApiProperty } from '@nestjs/swagger';

import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

// Số dòng tối đa một lần gọi: thay cho `sql_guard` ở phía bên gọi
export const INTEGRATION_MAX_LIMIT = 50;
// Số ngày tối đa của các tham số "trong N ngày" (một năm)
export const INTEGRATION_MAX_DAYS = 365;

// Mã trạng thái/loại trong ERP (enum Postgres, chữ hoa gạch dưới); giá trị lạ chỉ cho kết quả rỗng
export const STATUS_CODE_PATTERN = /^[A-Z][A-Z_]{1,40}$/;
// Mã chứng từ do người dùng gõ: chữ, số và vài dấu nối, không có khoảng trắng hay nháy
export const DOCUMENT_CODE_PATTERN = /^[A-Za-z0-9._/-]{1,40}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class DateRangeReqDto {
  @StringFieldOptional({
    description: 'Từ ngày (YYYY-MM-DD), gồm cả ngày này',
    pattern: ISO_DATE_PATTERN,
    patternMessage: 'startDate phải có dạng YYYY-MM-DD',
  })
  readonly startDate?: string;

  @StringFieldOptional({
    description: 'Đến ngày (YYYY-MM-DD), gồm cả ngày này',
    pattern: ISO_DATE_PATTERN,
    patternMessage: 'endDate phải có dạng YYYY-MM-DD',
  })
  readonly endDate?: string;
}

export class LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_LIMIT,
    description: `Số dòng tối đa (1-${INTEGRATION_MAX_LIMIT})`,
  })
  readonly limit?: number;
}

/** Bảng kết quả của mọi route `/integration`: cột theo tên nghiệp vụ, mỗi dòng là mảng giá trị
 * theo đúng thứ tự `columns`. Số đã là number, ngày là chuỗi YYYY-MM-DD. */
export class IntegrationResultResDto {
  @ApiProperty({ type: [String], description: 'Tên cột theo thứ tự' })
  columns!: string[];

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: {} },
    description: 'Các dòng, mỗi dòng là mảng giá trị theo thứ tự `columns`',
  })
  rows!: unknown[][];

  @ApiProperty({ description: 'true khi còn dòng chưa trả vì vượt giới hạn' })
  truncated!: boolean;
}
