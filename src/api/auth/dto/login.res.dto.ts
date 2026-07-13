import { Exclude, Expose } from 'class-transformer';

import { StringField } from '../../../decorators/field.decorators';

@Exclude()
export class LoginResDto {
  @Expose()
  @StringField({ description: 'JWT access token' })
  accessToken!: string;

  @Expose()
  @StringField({ description: 'JWT refresh token' })
  refreshToken!: string;

  @Expose()
  @StringField({ description: 'Token type' })
  tokenType!: string;
}
