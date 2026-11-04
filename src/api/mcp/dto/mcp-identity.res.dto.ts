import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class McpIdentityResDto {
  @Expose()
  @UUIDField({
    description: 'Credential id, dùng làm `X-On-Behalf-Of` khi gọi `/mcp`',
  })
  credentialId!: string;

  @Expose()
  @UUIDField({ description: 'User id' })
  userId!: string;

  @Expose()
  @StringField({ description: 'Username' })
  username!: string;

  @Expose()
  @StringField({ description: 'Tên hiển thị (họ tên, rơi về username)' })
  displayName!: string;

  @Expose()
  @StringField({
    each: true,
    description: 'Mã quyền `resource:action` của credential',
  })
  permissions!: string[];
}
