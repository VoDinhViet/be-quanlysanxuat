import { Transform } from 'class-transformer';

import { ItemStatus, ItemType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ExportItemsReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @EnumFieldOptional(() => ItemType, {
    each: true,
    description:
      'Filter by item type, CSV: `FG` (Sản phẩm) or `CONSUMABLE` (Vật tư)',
  })
  readonly type?: ItemType[];

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by supplier id (CONSUMABLE)' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => ItemStatus)
  readonly status?: ItemStatus;
}
