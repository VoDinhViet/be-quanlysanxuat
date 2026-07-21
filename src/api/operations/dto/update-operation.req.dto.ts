import { OperationStatus, OperationType } from '../../../database/schemas';
import { EnumFieldOptional, StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateOperationReqDto {
  @StringFieldOptional({ description: 'Operation name', maxLength: 255 })
  name?: string;

  @EnumFieldOptional(() => OperationType)
  type?: OperationType;

  @StringFieldOptional({ description: 'Operation code', maxLength: 50 })
  code?: string;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;

  @EnumFieldOptional(() => OperationStatus)
  status?: OperationStatus;
}
