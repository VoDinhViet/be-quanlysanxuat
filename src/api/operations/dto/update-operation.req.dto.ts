import { OperationStatus, OperationType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateOperationReqDto {
  @StringFieldOptional({ maxLength: 50, description: 'Operation code' })
  code?: string;

  @StringFieldOptional({ maxLength: 255, description: 'Operation name' })
  name?: string;

  @EnumFieldOptional(() => OperationType)
  type?: OperationType;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  note?: string | null;

  @EnumFieldOptional(() => OperationStatus)
  status?: OperationStatus;
}
