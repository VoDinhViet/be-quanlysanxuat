import { OperationType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateRoutingOperationReqDto {
  @UUIDField({ description: 'Master operation (công đoạn) id' })
  readonly operationId!: string;

  @EnumFieldOptional(() => OperationType, {
    description: 'Defaults to INHOUSE when omitted',
  })
  readonly type?: OperationType;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'STT chạy — sibling order; defaults to 0',
  })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
