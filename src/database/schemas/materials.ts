import { relations } from 'drizzle-orm';
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { credentials } from './credentials';
import { files } from './files';
import { materialGroups } from './material-groups';
import { units } from './units';

export enum MaterialType {
  INTERNAL = 'INTERNAL',
  CLIENT = 'CLIENT',
}

export const materialTypeEnum = pgEnum('material_type', [
  MaterialType.INTERNAL,
  MaterialType.CLIENT,
]);

export enum MaterialStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export const materialStatusEnum = pgEnum('material_status', [
  MaterialStatus.ACTIVE,
  MaterialStatus.INACTIVE,
]);

/**
 * Materials master data ("vật tư").
 *
 * Rules:
 * - No soft delete: a material is either ACTIVE or INACTIVE ("ngừng sử dụng").
 * - `code` is immutable.
 * - When `type` is CLIENT, `clientId` is required (enforced in the service).
 */
export const materials = pgTable(
  'materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    materialGroupId: uuid('material_group_id')
      .notNull()
      .references(() => materialGroups.id, { onDelete: 'restrict' }),
    type: materialTypeEnum('type').notNull().default(MaterialType.INTERNAL),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    imageFileId: uuid('image_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    status: materialStatusEnum('status')
      .notNull()
      .default(MaterialStatus.ACTIVE),
    note: varchar('note', { length: 1000 }),

    // Extended information (all optional)
    materialGrade: varchar('material_grade', { length: 255 }),
    technicalStandard: varchar('technical_standard', { length: 255 }),
    dimensions: varchar('dimensions', { length: 255 }),
    specificWeight: numeric('specific_weight', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }),
    colorSurface: varchar('color_surface', { length: 255 }),
    description: varchar('description', { length: 2000 }),
    origin: varchar('origin', { length: 255 }),
    leadTime: varchar('lead_time', { length: 100 }),

    createdBy: uuid('created_by').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_materials_unit_id').on(table.unitId),
    index('idx_materials_material_group_id').on(table.materialGroupId),
    index('idx_materials_client_id').on(table.clientId),
    index('idx_materials_image_file_id').on(table.imageFileId),
    index('idx_materials_created_by').on(table.createdBy),
    index('idx_materials_status').on(table.status),
    index('idx_materials_type').on(table.type),
  ],
);

/**
 * 1-many with materials: the "images & documents" tab. Each row is a link to a `files` registry
 * row, never a bare URL. Replace-all on update.
 */
export const materialAttachments = pgTable(
  'material_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_material_attachments_material_id').on(table.materialId),
    index('idx_material_attachments_file_id').on(table.fileId),
  ],
);

export const materialsRelations = relations(materials, ({ one, many }) => ({
  unit: one(units, {
    fields: [materials.unitId],
    references: [units.id],
  }),
  group: one(materialGroups, {
    fields: [materials.materialGroupId],
    references: [materialGroups.id],
  }),
  client: one(clients, {
    fields: [materials.clientId],
    references: [clients.id],
  }),
  creator: one(credentials, {
    fields: [materials.createdBy],
    references: [credentials.id],
  }),
  imageFile: one(files, {
    fields: [materials.imageFileId],
    references: [files.id],
  }),
  attachments: many(materialAttachments),
}));

export const materialAttachmentsRelations = relations(
  materialAttachments,
  ({ one }) => ({
    material: one(materials, {
      fields: [materialAttachments.materialId],
      references: [materials.id],
    }),
    file: one(files, {
      fields: [materialAttachments.fileId],
      references: [files.id],
    }),
  }),
);
