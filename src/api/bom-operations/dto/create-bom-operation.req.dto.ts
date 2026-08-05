import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateBomOperationReqDto {
  @UUIDField({ description: 'Master operation (công đoạn) id' })
  readonly operationId!: string;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'STT chạy — sibling order; defaults to 0',
  })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
