import { Exclude, Expose } from 'class-transformer';

import { OperationRefResDto } from '../../operations/dto/operation-ref.res.dto';
import {
  ClassField,
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobStepResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({
    int: true,
    description: 'STT chạy — deterministic step ordering',
  })
  sortOrder!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassField(() => OperationRefResDto)
  operation!: OperationRefResDto;

  @Expose()
  @DateField()
  createdAt!: Date;
}
