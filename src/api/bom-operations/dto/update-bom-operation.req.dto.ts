import { OperationType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateBomOperationReqDto {
  @EnumFieldOptional(() => OperationType)
  readonly type?: OperationType;

  @NumberFieldOptional({ int: true, min: 0 })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
