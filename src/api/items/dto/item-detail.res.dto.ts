import { Exclude, Expose } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { ItemRefResDto } from './item-ref.res.dto';
import { ItemResDto } from './item.res.dto';

@Exclude()
export class ItemDetailResDto extends ItemResDto {
  @Expose()
  @ClassFieldOptional(() => ItemRefResDto, {
    nullable: true,
    description: 'Item gốc được sao chép từ (nếu là bản sao)',
  })
  clonedFrom!: ItemRefResDto | null;
}
