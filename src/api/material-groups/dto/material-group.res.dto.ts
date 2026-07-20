import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class MaterialGroupResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Material group code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Material group name' })
  name!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  description!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
