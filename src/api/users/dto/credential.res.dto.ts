import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  ClassFieldOptional,
  EmailField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class RoleRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Stable role code, e.g. ADMIN' })
  code!: string;

  @Expose()
  @StringField({ description: 'Display name' })
  name!: string;
}

@Exclude()
export class CredentialResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  username!: string;

  @Expose()
  @EmailField()
  email!: string;

  @Expose()
  @BooleanField({ description: 'Credential enabled status' })
  credentialEnabled!: boolean;

  @Expose()
  @ClassFieldOptional(() => RoleRefResDto, {
    nullable: true,
    description: 'Role assigned to this login identity, or null if none',
  })
  role!: RoleRefResDto | null;
}
