import { relations } from 'drizzle-orm';
import { integer, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { credentials } from './credentials';

export enum FileKind {
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
}

export const fileKindEnum = pgEnum('file_kind', [FileKind.IMAGE, FileKind.DOCUMENT]);

/**
 * What a file was uploaded *for*. `FileKind` says which bytes are acceptable (the mime family);
 * `UploadType` says which screen asked for them, and is the key into `UPLOAD_POLICIES`
 * (`src/api/files/upload-policy.ts`) that decides the kind — and, later, the permission required.
 * Stored so the registry stays auditable ("every material document") without joining anything.
 */
export enum UploadType {
  USER_AVATAR = 'USER_AVATAR',
  MATERIAL_IMAGE = 'MATERIAL_IMAGE',
  MATERIAL_DOCUMENT = 'MATERIAL_DOCUMENT',
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  PRODUCT_DOCUMENT = 'PRODUCT_DOCUMENT',
  SUPPLIER_LOGO = 'SUPPLIER_LOGO',
  SUPPLIER_DOCUMENT = 'SUPPLIER_DOCUMENT',
}

export const uploadTypeEnum = pgEnum('upload_type', [
  UploadType.USER_AVATAR,
  UploadType.MATERIAL_IMAGE,
  UploadType.MATERIAL_DOCUMENT,
  UploadType.PRODUCT_IMAGE,
  UploadType.PRODUCT_DOCUMENT,
  UploadType.SUPPLIER_LOGO,
  UploadType.SUPPLIER_DOCUMENT,
]);

/**
 * File registry — the single source of truth for every uploaded file. `storageKey` is the
 * relative key the bound `StorageProvider` (`src/storage/`) uses to save/read/delete the bytes;
 * it is never a URL. The URL is minted per read as a short-lived signed link (see
 * `FileResDto`/`resolveFileUrl`), so it stays correct across a storage driver change and cannot
 * be stored anywhere as a permanent handle.
 * `storageDriver` records which driver wrote the file, in case drivers are ever mixed during a
 * migration to a new one (e.g. S3). Other entities (`users`, `materials`, ...)
 * reference a row here by `id` instead of duplicating url/filename/mimetype/size themselves.
 */
export const files = pgTable('files', {
  id: uuid('id').defaultRandom().primaryKey(),
  storageKey: varchar('storage_key', { length: 500 }).notNull().unique(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimetype: varchar('mimetype', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  checksum: varchar('checksum', { length: 64 }),
  type: uploadTypeEnum('type').notNull(),
  kind: fileKindEnum('kind').notNull(),
  storageDriver: varchar('storage_driver', { length: 20 }).notNull().default('local'),
  uploadedBy: uuid('uploaded_by').references(() => credentials.id, { onDelete: 'set null' }),
  /**
   * When an entity first referenced this file. `NULL` means uploaded but never linked — the user
   * picked an image and then abandoned the form — and makes the row sweepable by
   * `FilesCleanupService` once it is older than `upload.orphanTtl`. Set by `FilesService.linkFiles`.
   */
  linkedAt: timestamp('linked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const filesRelations = relations(files, ({ one }) => ({
  uploader: one(credentials, {
    fields: [files.uploadedBy],
    references: [credentials.id],
  }),
}));
