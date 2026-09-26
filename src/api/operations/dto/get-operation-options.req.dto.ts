import { OperationStatus, OperationType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/** Dropdown/picker công đoạn — không phân trang, tối đa `OPERATION_OPTIONS_LIMIT` dòng. */
export class GetOperationOptionsReqDto {
  @StringFieldOptional({
    description: 'Search on name (accent-insensitive)',
  })
  readonly q?: string;

  @EnumFieldOptional(() => OperationType)
  readonly type?: OperationType;

  @EnumFieldOptional(() => OperationStatus)
  readonly status?: OperationStatus;
}
