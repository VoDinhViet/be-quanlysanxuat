import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { OrderItemRefResDto } from '../../orders/dto/order-item-ref.res.dto';
import { QuotationItemAllocationResDto } from './quotation-item-allocation.res.dto';
import { QuotationItemSupplierResDto } from './quotation-item-supplier.res.dto';

@Exclude()
export class QuotationItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => OrderItemRefResDto)
  item!: OrderItemRefResDto;

  @Expose()
  @FileField('imageFile', 'Ảnh vật tư')
  image?: FileResDto | null;

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
