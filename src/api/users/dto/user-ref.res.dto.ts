import { PickType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { StringField } from '../../../decorators/field.decorators';
import { UserResDto } from './user.res.dto';

@Exclude()
export class UserRefResDto extends PickType(UserResDto, [
  'id',
  'code',
  'fullName',
] as const) {
  @Expose()
  @StringField({ description: 'Employee code' })
  code!: string;
}
