import { StringField } from '../../../decorators/field.decorators';

export class CopyItemReqDto {
  @StringField({
    description: 'Phiên bản của bản sao — mã giữ nguyên như bản gốc',
    maxLength: 50,
  })
  revision!: string;
}
