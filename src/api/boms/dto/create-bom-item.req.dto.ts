import { BomItemType } from '../../../database/schemas';
import {
  EnumField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * Adds one node ("[+]" popup) as a child of `parentId`, or a top-level item (direct child of the
 * FG root) when `parentId` is omitted. `itemType` + a single `itemId` (rather than separate
 * `productId`/`materialId`) is structurally exactly-one-of — the popup only ever picks one Mã, so
 * there is no request shape that could send both or neither.
 */
export class CreateBomItemReqDto {
  @EnumField(() => BomItemType, { description: 'WIP → PRODUCT, RM → MATERIAL' })
  readonly itemType!: BomItemType;

  @UUIDField({
    description:
      'Id of the linked product (WIP) or material (RM), per itemType',
  })
  readonly itemId!: string;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Parent bom_items id; omit/null for a top-level item (child of the FG root)',
  })
  readonly parentId?: string | null;

  // numeric(12,3) column — String()-ified in the service before insert. WIP items must be a whole
  // number (cross-field, depends on itemType — enforced in the service, not here).
  @NumberField({
    isPositive: true,
    description: 'SL — WIP: số nguyên, RM: có thể thập phân',
  })
  readonly quantity!: number;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'Sibling order; defaults to 0',
  })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
