import { StringField } from '../../../decorators/field.decorators';

export class CreateProductionJobNoteReqDto {
  @StringField({ maxLength: 1000, description: 'Nội dung ghi chú' })
  content!: string;
}
