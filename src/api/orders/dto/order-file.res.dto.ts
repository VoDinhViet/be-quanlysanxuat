import { Exclude, Expose } from 'class-transformer';

import { OrderFileType } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OrderFileResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDField()
  orderId!: string;

  @Expose()
  @EnumField(() => OrderFileType)
  fileType!: OrderFileType;

  @Expose()
  @StringField()
  originalName!: string;

  @Expose()
  @StringField()
  fileName!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  mimeType!: string | null;

  @Expose()
  @NumberFieldOptional({ nullable: true, int: true })
  fileSize!: number | null;

  @Expose()
  @StringField()
  filePath!: string;

  @Expose()
  @StringField()
  url!: string;

  @Expose()
  @DateField()
  createdAt!: Date;
}
