import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateRoutingOperationReqDto {
  @NumberFieldOptional({ int: true, min: 0 })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
