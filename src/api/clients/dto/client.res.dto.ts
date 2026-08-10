import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { ClientBaseResDto } from './client-base.res.dto';
import { ClientContactResDto } from './client-contact.res.dto';
import { ClientGroupRefResDto } from './client-group-ref.res.dto';

@Exclude()
export class ClientResDto extends ClientBaseResDto {
  @Expose()
  @ClassField(() => ClientGroupRefResDto)
  group!: ClientGroupRefResDto;

  @Expose()
  @ClassField(() => ClientContactResDto, { each: true })
  contacts!: ClientContactResDto[];

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;
}
