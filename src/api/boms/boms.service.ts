import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { asc, eq, and, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  bomItems,
  boms,
  materials,
  productRevisions,
  products,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { BomItemResDto } from './dto/bom-item.res.dto';
import type { BomTreeNode, BomTreeRow } from './types/bom-tree.type';

// Aliased twice: a row's item is either a product or a material (never both), so its unit comes
// from whichever side the left joins actually populated.
const productUnits = alias(units, 'product_units');
const materialUnits = alias(units, 'material_units');

@Injectable()
export class BomsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getBomTree(productId: string, revisionId: string): Promise<BomItemResDto[]> {
    await this.ensureProductExists(productId);
    await this.ensureRevisionExists(productId, revisionId);

    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.revisionId, revisionId),
    });

    // No BOM configured for this revision yet — a normal state, not an error.
    if (!bom) {
      return [];
    }

    // `productId`/`materialId` are mutually exclusive, so at most one side's left join matches —
    // `coalesce()` picks whichever did. No JS branching needed to normalize product vs. material
    // into one item shape; `ORDER BY sort_order, created_at` also does the sibling ordering here,
    // so buildTree() only has to group by parentId, not re-sort.
    const rows = await this.db
      .select({
        id: bomItems.id,
        parentId: bomItems.parentId,
        itemType: bomItems.itemType,
        itemId: sql<string>`coalesce(${products.id}, ${materials.id})`,
        code: sql<string>`coalesce(${products.code}, ${materials.code})`,
        name: sql<string>`coalesce(${products.name}, ${materials.name})`,
        unit: {
          id: sql<string>`coalesce(${productUnits.id}, ${materialUnits.id})`,
          code: sql<string>`coalesce(${productUnits.code}, ${materialUnits.code})`,
          name: sql<string>`coalesce(${productUnits.name}, ${materialUnits.name})`,
        },
        quantity: bomItems.quantity,
        sortOrder: bomItems.sortOrder,
        note: bomItems.note,
      })
      .from(bomItems)
      .leftJoin(products, eq(bomItems.productId, products.id))
      .leftJoin(materials, eq(bomItems.materialId, materials.id))
      .leftJoin(productUnits, eq(products.unitId, productUnits.id))
      .leftJoin(materialUnits, eq(materials.unitId, materialUnits.id))
      .where(eq(bomItems.bomId, bom.id))
      .orderBy(asc(bomItems.sortOrder), asc(bomItems.createdAt));

    const tree = this.buildTree(rows);

    return tree.map((node) =>
      plainToInstance(BomItemResDto, node, { excludeExtraneousValues: true }),
    );
  }

  /**
   * Nests the already-SQL-sorted flat rows by `parentId` — no recursive DB query, no re-sorting
   * (the query's `ORDER BY` already leaves each parent's children in the right relative order once
   * grouped). Just stamps a 1-based `level` (root's direct children = 1) on the way down.
   */
  private buildTree(rows: BomTreeRow[]): BomTreeNode[] {
    const childrenByParent = new Map<string | null, BomTreeRow[]>();
    for (const row of rows) {
      const siblings = childrenByParent.get(row.parentId) ?? [];
      siblings.push(row);
      childrenByParent.set(row.parentId, siblings);
    }

    const build = (parentId: string | null, level: number): BomTreeNode[] =>
      (childrenByParent.get(parentId) ?? []).map((row) => ({
        ...row,
        level,
        children: build(row.id, level + 1),
      }));

    return build(null, 1);
  }

  private async ensureProductExists(productId: string): Promise<void> {
    const existing = await this.db.query.products.findFirst({
      columns: { id: true },
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureRevisionExists(productId: string, revisionId: string): Promise<void> {
    const existing = await this.db.query.productRevisions.findFirst({
      columns: { id: true },
      where: and(eq(productRevisions.id, revisionId), eq(productRevisions.productId, productId)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E048, HttpStatus.NOT_FOUND);
    }
  }
}
