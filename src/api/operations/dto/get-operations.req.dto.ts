import { OperationStatus, OperationType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOperationsReqDto {
  @StringFieldOptional({
    description: 'Search on name (accent-insensitive)',
  })
  readonly q?: string;

  @EnumFieldOptional(() => OperationType, {
    description:
      'Filter by type — e.g. type=OUTSOURCE for the "Gia công ngoài" screen',
  })
  readonly type?: OperationType;

  @EnumFieldOptional(() => OperationStatus)
  readonly status?: OperationStatus;
}
