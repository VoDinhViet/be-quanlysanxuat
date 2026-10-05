import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ItemStatus, ItemType } from '../../../database/schemas';
import {
  BooleanFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ToArrayFromCsv } from '../../../decorators/transform.decorators';

export class GetItemsReqDto extends PageOptionsDto {
  @ToArrayFromCsv()
  @EnumFieldOptional(() => ItemType, { each: true })
  readonly type?: ItemType[];

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by supplier id (DIRECT)' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => ItemStatus)
  readonly status?: ItemStatus;

  @BooleanFieldOptional({
    description:
      'Kèm tồn thực tế hiện tại (gộp mọi kho) của từng vật tư ở field onHand — mặc định không tính',
  })
  readonly withOnHand?: boolean;
}
