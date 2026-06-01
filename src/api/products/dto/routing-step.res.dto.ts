import { Exclude, Expose, Type } from 'class-transformer';

import {
  BooleanField,
  ClassFieldOptional,
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ProductOptionResDto } from './product-option.res.dto';

@Exclude()
export class RoutingStepResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDField()
  productRevisionId!: string;

  @Expose()
  @UUIDField()
  itemId!: string;

  @Expose()
  @UUIDField()
  operationId!: string;

  @Expose()
  @Type(() => ProductOptionResDto)
  @ClassFieldOptional(() => ProductOptionResDto, { nullable: true })
  operation!: ProductOptionResDto | null;

  @Expose()
  @NumberField({ int: true })
  stepNo!: number;

  @Expose()
  @BooleanField()
  isOutsideProcess!: boolean;

  @Expose()
  @UUIDFieldOptional({ nullable: true })
  defaultSupplierId!: string | null;

  @Expose()
  @Type(() => ProductOptionResDto)
  @ClassFieldOptional(() => ProductOptionResDto, { nullable: true })
  defaultSupplier!: ProductOptionResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
