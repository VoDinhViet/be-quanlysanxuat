import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class DepartmentResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Department code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Department name, e.g. Phòng Kỹ thuật' })
  name!: string;
}
