import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateProductRevisionReqDto {
  @StringFieldOptional({ maxLength: 50 })
  revisionNo?: string;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
