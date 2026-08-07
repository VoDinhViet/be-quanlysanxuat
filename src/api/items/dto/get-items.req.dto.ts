import { Transform } from 'class-transformer';

import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ItemStatus, ItemType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetItemsReqDto extends PageOptionsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @EnumFieldOptional(() => ItemType, { each: true })
  readonly type?: ItemType[];

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by supplier id (RM)' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => ItemStatus)
  readonly status?: ItemStatus;
}
