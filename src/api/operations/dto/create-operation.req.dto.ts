import { OperationStatus, OperationType } from '../../../database/schemas';
import {
  EnumField,
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateOperationReqDto {
  @StringField({
    description: 'Operation name (công đoạn), e.g. Cắt laser',
    maxLength: 255,
  })
  name!: string;

  @EnumField(() => OperationType, {
    description: 'Inhouse or outsourced (gia công ngoài)',
  })
  type!: OperationType;

  @StringFieldOptional({
    description: 'Operation code; auto-generated if omitted',
    maxLength: 50,
  })
  code?: string;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;

  @EnumFieldOptional(() => OperationStatus)
  status?: OperationStatus;
}
