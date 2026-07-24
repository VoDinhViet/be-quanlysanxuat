import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * Edits an existing step's STT chạy / note. `operationId` is immutable (delete + re-add to
 * change which operation a step points at), same convention as `UpdateBomItemReqDto`.
 */
export class UpdateRoutingStepReqDto {
  @NumberFieldOptional({ int: true, min: 0 })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
