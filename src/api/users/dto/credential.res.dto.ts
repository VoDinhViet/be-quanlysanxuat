import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  EmailFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class CredentialResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringFieldOptional({ description: 'Username', nullable: true })
  username!: string | null;

  @Expose()
  @EmailFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
