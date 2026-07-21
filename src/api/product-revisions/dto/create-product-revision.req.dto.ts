import {
  BooleanFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateProductRevisionReqDto {
  @StringFieldOptional({
    description: 'Revision number; auto-generated (Rxx) if omitted',
    maxLength: 50,
  })
  revisionNo?: string;

  @UUIDField({ description: 'Revision this one is branched/copied from ("Sao chép từ")' })
  sourceRevisionId!: string;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;

  @BooleanFieldOptional({
    description: "Make this the product's current revision immediately (default true)",
  })
  setAsCurrent?: boolean;
}
