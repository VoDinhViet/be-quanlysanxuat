import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './identity-access/users';

export enum FileKind {
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
  // Ảnh ∪ tài liệu, cap theo `upload.maxDocumentSize` — bằng chứng IQC vừa có ảnh chụp thực tế
  // vừa có tài liệu đo lường (PDF), không thuộc gọn về 1 trong 2 loại còn lại.
  EVIDENCE = 'EVIDENCE',
}

export const fileKindEnum = pgEnum('file_kind', [
  FileKind.IMAGE,
  FileKind.DOCUMENT,
  FileKind.EVIDENCE,
]);

/**
 * What a file was uploaded *for*.
 *
 * Rules:
 * - `FileKind` says which bytes are acceptable (the mime family); `UploadType` says which screen
 *   asked for them, and is the key into `uploadPolicies` (`src/api/files/upload-policy.ts`) that
 *   decides the kind — and, later, the permission required.
 * - Stored so the registry stays auditable ("every consumable document") without joining anything.
 */
export enum UploadType {
  USER_AVATAR = 'USER_AVATAR',
  CONSUMABLE_IMAGE = 'CONSUMABLE_IMAGE',
  CONSUMABLE_DOCUMENT = 'CONSUMABLE_DOCUMENT',
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  /** Retired 2026-08-27 — thay bằng `ITEM_DOCUMENT`. Tài liệu đính kèm cấp sản phẩm bị bỏ nhầm khi
   * gộp `products`+`materials` thành `items` (04/08), tưởng bản vẽ theo node BOM thay thế được —
   * PhuocPT xác nhận đây là hai thứ khác nhau, khôi phục (BUG-007, 27/08). Giữ comment, không tái
   * sử dụng số. */
  PRODUCT_DOCUMENT = 'PRODUCT_DOCUMENT',
  SUPPLIER_LOGO = 'SUPPLIER_LOGO',
  SUPPLIER_DOCUMENT = 'SUPPLIER_DOCUMENT',
  /** Retired 2026-09-17 — cột `bom_items.drawing_file_id` đã bỏ (migration 0185); bản vẽ theo node
   * BOM không còn. Giữ value, không tái sử dụng. */
  BOM_ITEM_DRAWING = 'BOM_ITEM_DRAWING',
  ORDER_DOCUMENT = 'ORDER_DOCUMENT',
  // Trang chi tiết IQC/OQC — 2 bộ bằng chứng riêng mỗi trang, xem `qc_files.kind`.
  IQC_EVIDENCE = 'IQC_EVIDENCE',
  IQC_DISPOSITION_EVIDENCE = 'IQC_DISPOSITION_EVIDENCE',
  OQC_EVIDENCE = 'OQC_EVIDENCE',
  OQC_DISPOSITION_EVIDENCE = 'OQC_DISPOSITION_EVIDENCE',
  // Ảnh đính kèm khi báo cáo hoàn thành một công đoạn — màn "Thực hiện sản xuất"
  // (`POST /production-execution/operations/:jobOperationId/reports`).
  PRODUCTION_OPERATION_EVIDENCE = 'PRODUCTION_OPERATION_EVIDENCE',
  // File đính kèm khi kho xác nhận xuất trả NCC (`POST /supplier-returns/:id/post`).
  SUPPLIER_RETURN_EVIDENCE = 'SUPPLIER_RETURN_EVIDENCE',
  // Tài liệu đính kèm cấp item — mọi `type` (FG/CONSUMABLE), danh sách nhiều file. Thay
  // `PRODUCT_DOCUMENT` đã nghỉ hưu (BUG-007, 2026-08-27).
  ITEM_DOCUMENT = 'ITEM_DOCUMENT',
  // Ảnh riêng của một node BOM `COMPONENT` (`bom_items.image_file_id`, tối đa 1) — khác
  // `PRODUCT_IMAGE` là ảnh của chính item.
  BOM_ITEM_IMAGE = 'BOM_ITEM_IMAGE',
  // File LSX đã ký (bản scan/PDF)
  PRODUCTION_ORDER_SIGNED_DOCUMENT = 'PRODUCTION_ORDER_SIGNED_DOCUMENT',
}

export const uploadTypeEnum = pgEnum('upload_type', [
  UploadType.USER_AVATAR,
  UploadType.CONSUMABLE_IMAGE,
  UploadType.CONSUMABLE_DOCUMENT,
  UploadType.PRODUCT_IMAGE,
  UploadType.PRODUCT_DOCUMENT,
  UploadType.SUPPLIER_LOGO,
  UploadType.SUPPLIER_DOCUMENT,
  UploadType.BOM_ITEM_DRAWING,
  UploadType.ORDER_DOCUMENT,
  UploadType.IQC_EVIDENCE,
  UploadType.IQC_DISPOSITION_EVIDENCE,
  UploadType.OQC_EVIDENCE,
  UploadType.OQC_DISPOSITION_EVIDENCE,
  UploadType.PRODUCTION_OPERATION_EVIDENCE,
  UploadType.SUPPLIER_RETURN_EVIDENCE,
  UploadType.ITEM_DOCUMENT,
  UploadType.BOM_ITEM_IMAGE,
  UploadType.PRODUCTION_ORDER_SIGNED_DOCUMENT,
]);

/**
 * File registry — the single source of truth for every uploaded file.
 *
 * Rules:
 * - `storageKey` is the relative key the bound `StorageProvider` (`src/storage/`) uses to
 *   save/delete the bytes. `FileResDto.url` is derived from it at read time (`/<storageKey>`,
 *   served statically by `ServeStaticModule` — `docs/decisions/files-registry.md`), a permanent
 *   public link, safe to cache/store on the client indefinitely.
 * - `storageDriver` records which driver wrote the file, in case drivers are ever mixed during a
 *   migration to a new one (e.g. S3).
 * - Other entities (`users`, `items`, ...) reference a row here by `id` instead of
 *   duplicating url/filename/mimetype/size themselves.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storageKey: varchar('storage_key', { length: 500 }).notNull().unique(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimetype: varchar('mimetype', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    checksum: varchar('checksum', { length: 64 }),
    type: uploadTypeEnum('type').notNull(),
    kind: fileKindEnum('kind').notNull(),
    storageDriver: varchar('storage_driver', { length: 20 })
      .notNull()
      .default('local'),
    uploadedBy: uuid('uploaded_by').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    /** When an entity first referenced this file. `NULL` means uploaded but never linked (the
     * user picked an image and abandoned the form), making the row sweepable by
     * `FilesCleanupService` once older than `upload.orphanTtl`. Set by `FilesService.linkFiles`. */
    linkedAt: timestamp('linked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_files_uploaded_by').on(table.uploadedBy),
    check('chk_files_size_non_negative', sql`size >= 0`),
  ],
);

export const filesRelations = relations(files, ({ one }) => ({
  uploaderBy: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
}));

export type FileSelect = typeof files.$inferSelect;
