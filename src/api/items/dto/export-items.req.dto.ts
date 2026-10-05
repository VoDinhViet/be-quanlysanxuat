import { ItemStatus, ItemType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ToArrayFromCsv } from '../../../decorators/transform.decorators';

export class ExportItemsReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @ToArrayFromCsv()
  @EnumFieldOptional(() => ItemType, {
    each: true,
    description:
      'Filter by item type, CSV: `FG` (Sản phẩm) or `DIRECT` (Vật tư)',
  })
  readonly type?: ItemType[];

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by supplier id (DIRECT)' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => ItemStatus)
  readonly status?: ItemStatus;
}
