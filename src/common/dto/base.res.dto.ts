import { Expose } from 'class-transformer';
import { DateField } from '../../decorators/field.decorators';

export abstract class BaseResDto {
  @Expose()
  @DateField({ description: 'Creation date' })
  createdAt!: Date;

  @Expose()
  @DateField({ description: 'Last update date' })
  updatedAt!: Date;
}
