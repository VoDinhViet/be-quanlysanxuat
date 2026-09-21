import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { QuotationItemAllocationResDto } from './quotation-item-allocation.res.dto';
import { QuotationItemSupplierResDto } from './quotation-item-supplier.res.dto';

@Exclude()
export class QuotationItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'SL báo giá của vật tư — tổng SL các phân bổ' })
  quantity!: number;

  @Expose()
  @ClassField(() => QuotationItemAllocationResDto, { each: true })
  allocations!: QuotationItemAllocationResDto[];

  @Expose()
  @ClassFieldOptional(() => QuotationItemSupplierResDto, { each: true })
  suppliers!: QuotationItemSupplierResDto[];
}
