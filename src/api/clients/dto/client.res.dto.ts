import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
} from '../../../decorators/field.decorators';
import { ClientBaseResDto } from './client-base.res.dto';
import { ClientContactResDto } from './client-contact.res.dto';
import { ClientCreatorResDto } from './client-creator.res.dto';
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
  @ClassFieldOptional(() => ClientCreatorResDto, { nullable: true })
  creator!: ClientCreatorResDto | null;
}
