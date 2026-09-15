import { Expose } from 'class-transformer';
import { NumberField } from '../../../decorators/field.decorators';
import { DepartmentResDto } from './department.res.dto';

export class DepartmentDetailResDto extends DepartmentResDto {
  @Expose()
  @NumberField({ description: 'Number of positions' })
  positionCount!: number;

  @Expose()
  @NumberField({ description: 'Number of employees' })
  employeeCount!: number;
}
