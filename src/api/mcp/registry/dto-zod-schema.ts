import type { Type } from '@nestjs/common';
import { z } from 'zod';

import {
  MCP_DEFAULT_PAGE_LIMIT,
  MCP_MAX_ARGUMENT_ITEMS,
  MCP_MAX_ARGUMENT_LENGTH,
  MCP_MAX_PAGE_LIMIT,
} from '../mcp.constant';
import { readMetadata } from './read-metadata';
import {
  SWAGGER_API_MODEL_PROPERTIES,
  SWAGGER_API_MODEL_PROPERTIES_ARRAY,
} from './swagger-metadata';

type LeafSchema = Record<string, unknown>;

// Các field decorator của dự án ghi nguyên options vào metadata Swagger, nên `min`/`max`/`int`
// của `NumberField` nằm lẫn với `minimum`/`maximum` chuẩn của Swagger
interface PropertyMetadata {
  type?: unknown;
  required?: boolean;
  enum?: unknown;
  isArray?: boolean;
  format?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  min?: number;
  max?: number;
  int?: boolean;
  minLength?: number;
  maxLength?: number;
  items?: LeafSchema;
}

/**
 * Với trường mảng (`each: true`), Swagger đổi `type` thành chuỗi `'array'` và tự dựng sẵn `items`
 * (kèm enum), đôi khi lồng thêm một lớp mảng. Lấy phần tử trong cùng để bọc mảng đúng một lần.
 */
function swaggerItems(metadata: PropertyMetadata): LeafSchema | undefined {
  if (metadata.type !== 'array' || !metadata.items) {
    return undefined;
  }

  let leaf = metadata.items;
  while (leaf.type === 'array' && leaf.items) {
    leaf = leaf.items as LeafSchema;
  }

  return {
    ...leaf,
    ...(metadata.format && !leaf.format && { format: metadata.format }),
  };
}

function enumValues(enumSource: unknown): unknown[] {
  if (Array.isArray(enumSource)) {
    return enumSource;
  }

  // Enum số của TypeScript có thêm khoá ngược (`"0": "A"`), bỏ đi để chỉ còn giá trị thật
  return Object.entries(enumSource as Record<string, unknown>)
    .filter(([key]) => Number.isNaN(Number(key)))
    .map(([, value]) => value);
}

// Mô tả phần tử (hoặc cả giá trị khi không phải mảng) theo dạng JSON Schema rút gọn
function leafSchema(metadata: PropertyMetadata): LeafSchema {
  const normalizedItems = swaggerItems(metadata);
  if (normalizedItems) {
    return normalizedItems;
  }

  if (metadata.enum !== undefined) {
    return { enum: enumValues(metadata.enum) };
  }

  const { type } = metadata;
  if (type === Number) {
    return {
      type: metadata.int ? 'integer' : 'number',
      minimum: metadata.minimum ?? metadata.min,
      maximum: metadata.maximum ?? metadata.max,
    };
  }
  if (type === Boolean) {
    return { type: 'boolean' };
  }
  if (type === Date) {
    return {
      type: 'string',
      format: 'date',
      description: 'ISO 8601 date, e.g. 2026-11-04',
    };
  }
  if (type === String) {
    return {
      type: 'string',
      format: metadata.format,
      minLength: metadata.minLength,
      maxLength: metadata.maxLength,
    };
  }

  // Không có DTO query nào có field lồng (`ClassField`), nên kiểu lạ nhận giá trị bất kỳ
  return {};
}

function enumToZod(values: unknown[]): z.ZodTypeAny {
  if (values.every((value) => typeof value === 'string')) {
    return z.enum(values as [string, ...string[]]);
  }

  return z.number().refine((value) => values.includes(value), {
    message: `must be one of ${values.join(', ')}`,
  });
}

function numberToZod(leaf: LeafSchema): z.ZodTypeAny {
  let schema = z.coerce.number();
  if (leaf.type === 'integer') {
    schema = schema.int();
  }
  if (typeof leaf.minimum === 'number') {
    schema = schema.min(leaf.minimum);
  }
  if (typeof leaf.maximum === 'number') {
    schema = schema.max(leaf.maximum);
  }

  return schema;
}

function stringToZod(leaf: LeafSchema): z.ZodTypeAny {
  const maxLength = Math.min(
    typeof leaf.maxLength === 'number' ? leaf.maxLength : Infinity,
    MCP_MAX_ARGUMENT_LENGTH,
  );
  let schema = z.string().max(maxLength);
  if (typeof leaf.minLength === 'number') {
    schema = schema.min(leaf.minLength);
  }
  if (leaf.format === 'uuid') {
    schema = schema.uuid();
  }
  if (leaf.format === 'date') {
    schema = schema.date();
  }

  return schema;
}

function leafToZod(leaf: LeafSchema): z.ZodTypeAny {
  if (Array.isArray(leaf.enum)) {
    return enumToZod(leaf.enum);
  }
  if (leaf.type === 'number' || leaf.type === 'integer') {
    return numberToZod(leaf);
  }
  if (leaf.type === 'boolean') {
    return z.boolean();
  }
  if (leaf.type === 'string') {
    return stringToZod(leaf);
  }

  return z.unknown();
}

// Agent hay gửi null hoặc chuỗi rỗng cho tham số tuỳ chọn; coi như không lọc
function emptyToUndefined(value: unknown): unknown {
  return value === null || value === '' ? undefined : value;
}

function propertyToZod(metadata: PropertyMetadata): z.ZodTypeAny {
  const leaf = leafSchema(metadata);
  const elementSchema = leafToZod(leaf);
  let schema = metadata.isArray
    ? z.array(elementSchema).max(MCP_MAX_ARGUMENT_ITEMS)
    : elementSchema;

  const description = [leaf.description, metadata.description]
    .filter(Boolean)
    .join('. ');
  if (description) {
    schema = schema.describe(description);
  }
  if (metadata.required === false) {
    schema =
      metadata.default === undefined
        ? schema.optional()
        : schema.default(metadata.default);

    return z.preprocess(emptyToUndefined, schema);
  }

  return schema;
}

// DTO phân trang (có `page`) không có trần `limit`, nên MCP tự đặt: vượt trần thì cắt về trần
// thay vì báo lỗi vì agent hay xin nhiều hơn mức cho phép. DTO summary tự khai `limit` riêng
const pageLimitSchema = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .int()
    .min(1)
    .default(MCP_DEFAULT_PAGE_LIMIT)
    .transform((limit) => Math.min(limit, MCP_MAX_PAGE_LIMIT))
    .describe(
      `Page size, default ${MCP_DEFAULT_PAGE_LIMIT}, capped at ${MCP_MAX_PAGE_LIMIT}`,
    ),
);

/**
 * Dựng các field zod từ metadata Swagger mà các field decorator của dự án đã ghi sẵn
 * (`src/decorators/field.decorators.ts`), để tool MCP và Swagger không lệch nhau.
 * Field khai `swagger: false` không có metadata nên không xuất hiện.
 */
export function buildDtoShape(dto: Type<object>): z.ZodRawShape {
  const prototype = dto.prototype as object;
  const propertyKeys =
    readMetadata<string[]>(SWAGGER_API_MODEL_PROPERTIES_ARRAY, prototype) ?? [];

  const isPaginated = propertyKeys.some(
    (propertyKey) => propertyKey.replace(/^:/, '') === 'page',
  );
  const shape: z.ZodRawShape = {};
  for (const propertyKey of new Set(propertyKeys)) {
    const name = propertyKey.replace(/^:/, '');
    const metadata = readMetadata<PropertyMetadata>(
      SWAGGER_API_MODEL_PROPERTIES,
      prototype,
      name,
    );
    if (metadata) {
      shape[name] =
        name === 'limit' && isPaginated
          ? pageLimitSchema
          : propertyToZod(metadata);
    }
  }

  return shape;
}
