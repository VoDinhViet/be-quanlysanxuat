import { Exclude, Expose } from 'class-transformer';

import { OperationStatus, OperationType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OperationCreatorResDto } from './operation-creator.res.dto';

@Exclude()
export class OperationResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Operation code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Operation name' })
  name!: string;

  @Expose()
  @EnumField(() => OperationType)
  type!: OperationType;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @EnumField(() => OperationStatus)
  status!: OperationStatus;

  @Expose()
  @ClassFieldOptional(() => OperationCreatorResDto, { nullable: true })
  creator!: OperationCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
