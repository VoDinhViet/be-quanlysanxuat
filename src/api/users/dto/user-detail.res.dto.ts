import { Exclude, Expose } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { CredentialResDto } from './credential.res.dto';
import { UserResDto } from './user.res.dto';

@Exclude()
export class UserDetailResDto extends UserResDto {
  @Expose()
  @ClassFieldOptional(() => CredentialResDto, { nullable: true })
  credential!: CredentialResDto | null;
}
