import { StringField } from '../../../decorators/field.decorators';

export class RefreshTokenReqDto {
  @StringField({ description: 'Refresh token' })
  refreshToken!: string;
}
