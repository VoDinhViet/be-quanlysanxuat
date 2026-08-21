import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
 *   asked for them, and is the key into `UPLOAD_POLICIES` (`src/api/files/upload-policy.ts`) that
 *   decides the kind — and, later, the permission required.
 * - Stored so the registry stays auditable ("every material document") without joining anything.
 */
export enum UploadType {
  USER_AVATAR = 'USER_AVATAR',
  MATERIAL_IMAGE = 'MATERIAL_IMAGE',
  MATERIAL_DOCUMENT = 'MATERIAL_DOCUMENT',
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  /** Retired — `product_attachments` was dropped in favour of per-BOM-item drawings. Value kept
   * because Postgres can't drop an enum value; new files must not use it. */
  PRODUCT_DOCUMENT = 'PRODUCT_DOCUMENT',
  SUPPLIER_LOGO = 'SUPPLIER_LOGO',
  SUPPLIER_DOCUMENT = 'SUPPLIER_DOCUMENT',
  BOM_ITEM_DRAWING = 'BOM_ITEM_DRAWING',
  ORDER_DOCUMENT = 'ORDER_DOCUMENT',
  // Trang chi tiết IQC — 2 bộ bằng chứng riêng, xem `qc_attachments.kind`.
  IQC_EVIDENCE = 'IQC_EVIDENCE',
  IQC_DISPOSITION_EVIDENCE = 'IQC_DISPOSITION_EVIDENCE',
}

export const uploadTypeEnum = pgEnum('upload_type', [
  UploadType.USER_AVATAR,
  UploadType.MATERIAL_IMAGE,
  UploadType.MATERIAL_DOCUMENT,
  UploadType.PRODUCT_IMAGE,
  UploadType.PRODUCT_DOCUMENT,
  UploadType.SUPPLIER_LOGO,
  UploadType.SUPPLIER_DOCUMENT,
  UploadType.BOM_ITEM_DRAWING,
  UploadType.ORDER_DOCUMENT,
  UploadType.IQC_EVIDENCE,
  UploadType.IQC_DISPOSITION_EVIDENCE,
]);

/**
 * File registry — the single source of truth for every uploaded file.
 *
 * Rules:
 * - `storageKey` is the relative key the bound `StorageProvider` (`src/storage/`) uses to
 *   save/read/delete the bytes; it is never a URL. The URL is minted per read as a short-lived
 *   signed link (see `FileResDto`/`resolveFileUrl`), so it stays correct across a storage driver
 *   change and cannot be stored anywhere as a permanent handle.
 * - `storageDriver` records which driver wrote the file, in case drivers are ever mixed during a
 *   migration to a new one (e.g. S3).
 * - Other entities (`users`, `materials`, ...) reference a row here by `id` instead of
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
  },
  (table) => [index('idx_files_uploaded_by').on(table.uploadedBy)],
);

export const filesRelations = relations(files, ({ one }) => ({
  uploaderBy: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
}));

export type FileSelect = typeof files.$inferSelect;
