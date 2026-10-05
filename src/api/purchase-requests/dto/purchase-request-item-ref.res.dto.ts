import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { PurchaseRequestRefResDto } from './purchase-request-ref.res.dto';

@Exclude()
export class PurchaseRequestItemRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'SL đề xuất' })
  quantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú dòng đề xuất' })
  note!: string | null;

  @Expose()
  @ClassField(() => PurchaseRequestRefResDto)
  purchaseRequest!: PurchaseRequestRefResDto;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;
}
