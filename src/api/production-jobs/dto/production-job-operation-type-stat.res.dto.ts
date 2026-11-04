import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobOperationTypeStatResDto {
  @Expose()
  @StringField({ description: 'Loại công đoạn: INHOUSE hoặc OUTSOURCE' })
  type!: string;

  @Expose()
  @NumberField({ description: 'Số công đoạn của JOB', int: true })
  operationCount!: number;
}
