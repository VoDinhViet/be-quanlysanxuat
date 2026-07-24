import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderItemProductRefResDto } from './order-item-product-ref.res.dto';

@Exclude()
export class OrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => OrderItemProductRefResDto)
  product!: OrderItemProductRefResDto;

  @Expose()
  @StringField({ description: 'Quantity (numeric, serialized as a string)' })
  quantity!: string;

  @Expose()
  @StringField({
    description: 'Unit price (numeric, serialized as a string)',
  })
  unitPrice!: string;

  @Expose()
  @StringField({
    description: 'quantity × unitPrice (numeric, serialized as a string)',
  })
  lineTotal!: string;

  @Expose()
  @NumberField({ int: true, description: 'Deterministic sibling ordering' })
  sortOrder!: number;
}
