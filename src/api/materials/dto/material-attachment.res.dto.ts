import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class MaterialAttachmentResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  url!: string;

  @Expose()
  @StringField()
  filename!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  mimetype!: string | null;

  @Expose()
  @NumberFieldOptional({ nullable: true })
  size!: number | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}
