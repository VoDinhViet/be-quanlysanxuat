import { Exclude, Expose } from 'class-transformer';

import { ClientStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ClientContactResDto } from './client-contact.res.dto';
import { ClientCreatorResDto } from './client-creator.res.dto';
import { ClientGroupRefResDto } from './client-group-ref.res.dto';

@Exclude()
export class ClientResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Client code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Client name' })
  name!: string;

  @Expose()
  @ClassField(() => ClientGroupRefResDto)
  group!: ClientGroupRefResDto;

  @Expose()
  @StringFieldOptional({ nullable: true })
  taxCode!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  phoneNumber!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  email!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  address!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @EnumField(() => ClientStatus)
  status!: ClientStatus;

  @Expose()
  @ClassField(() => ClientContactResDto, { each: true })
  contacts!: ClientContactResDto[];

  @Expose()
  @ClassFieldOptional(() => ClientCreatorResDto, { nullable: true })
  creator!: ClientCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
