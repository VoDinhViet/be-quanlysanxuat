import { Exclude, Expose } from 'class-transformer';

import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import {
  ClassField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PositionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Position code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Position name, e.g. Trưởng phòng' })
  name!: string;

  @Expose()
  @ClassField(() => DepartmentResDto, {
    description: 'Department this position belongs to',
  })
  department!: DepartmentResDto;
}
