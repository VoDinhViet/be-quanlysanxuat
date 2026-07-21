import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateProductRevisionReqDto {
  @StringFieldOptional({ description: 'Revision number, e.g. R01', maxLength: 50 })
  revisionNo?: string;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;
}
