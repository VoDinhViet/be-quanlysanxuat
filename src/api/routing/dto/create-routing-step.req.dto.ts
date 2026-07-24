import {
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

/**
 * Adds one step ("[+]" in the Routing popup) to a routing (Cấp 0 root product, or a specific BOM
 * node — whichever endpoint this is posted to). `operationId` is immutable once added — changing
 * the operation of a step means delete + re-add, same convention as `CreateBomItemReqDto`.
 */
export class CreateRoutingStepReqDto {
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
