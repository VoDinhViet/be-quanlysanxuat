import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class LoginResDto {
  @Expose()
  @StringField()
  userId!: string;

  @Expose()
  @StringFieldOptional()
  roleCode?: string;

  @Expose()
  @StringField({ each: true })
  permissions!: string[];

  @Expose()
  @StringField()
  accessToken!: string;

  @Expose()
  @StringField()
  refreshToken!: string;

  @Expose()
  @NumberField()
  tokenExpires!: number;
}
