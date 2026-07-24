import { Exclude, Expose } from 'class-transformer';

import { OperationRefResDto } from '../../operations/dto/operation-ref.res.dto';
import {
  ClassField,
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

/**
 * One step of a routing ("Công đoạn") — an operation plus its position ("STT chạy") in the
 * sequence. Shared shape for both routing kinds (Cấp 0 root product, and as-used per BOM node) —
 * the DTO itself doesn't expose which target it belongs to, that's implicit in which endpoint
 * returned it. `operation` is the lightweight ref already used elsewhere (`OperationRefResDto`);
 * relation key matches the property name, so no rename transform needed.
 */
@Exclude()
export class RoutingStepResDto {
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

  @Expose()
  @DateField()
  updatedAt!: Date;
}
