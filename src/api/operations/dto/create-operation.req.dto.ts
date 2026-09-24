import { OperationStatus, OperationType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateOperationReqDto {
  @StringField({ maxLength: 50, description: 'Operation code' })
  code!: string;

  @StringField({ maxLength: 255, description: 'Operation name' })
  name!: string;

  @EnumFieldOptional(() => OperationType, {
    description: 'Defaults to INHOUSE when omitted',
  })
  type?: OperationType;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  note?: string | null;

  @EnumFieldOptional(() => OperationStatus, {
    description: 'Defaults to ACTIVE when omitted',
  })
  status?: OperationStatus;
}
