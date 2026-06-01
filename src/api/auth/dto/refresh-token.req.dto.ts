import { TokenField } from '../../../decorators/field.decorators';

export class RefreshTokenReqDto {
  @TokenField({ description: 'Refresh token' })
  refreshToken!: string;
}
