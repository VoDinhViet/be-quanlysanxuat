import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  ClassFieldOptional,
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductRevisionCreatorResDto } from './product-revision-creator.res.dto';

@Exclude()
export class ProductRevisionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Revision number, e.g. R01' })
  revisionNo!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @BooleanField({ description: "Whether this is the product's current (active) revision" })
  isActive!: boolean;

  @Expose()
  @ClassFieldOptional(() => ProductRevisionCreatorResDto, { nullable: true })
  creator!: ProductRevisionCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
