import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  DateField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

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

  @Expose()
  @BooleanField({ description: 'Active status' })
  isActive!: boolean;

  @Expose()
  @DateField({ description: 'Created at' })
  createdAt!: Date;

  @Expose()
  @DateField({ description: 'Updated at' })
  updatedAt!: Date;
}
