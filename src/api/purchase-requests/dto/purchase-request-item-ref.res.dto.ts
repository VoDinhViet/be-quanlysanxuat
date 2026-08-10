import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
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
  @ClassField(() => PurchaseRequestRefResDto)
  purchaseRequest!: PurchaseRequestRefResDto;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;
}
