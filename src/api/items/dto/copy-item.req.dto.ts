import { StringFieldOptional } from '../../../decorators/field.decorators';

export class CopyItemReqDto {
  @StringFieldOptional({
    description:
      'FG: phiên bản của bản sao (bắt buộc) — mã giữ nguyên như bản gốc',
    maxLength: 50,
  })
  readonly revision?: string;

  @StringFieldOptional({
    description: 'CONSUMABLE: mã vật tư mới (bắt buộc)',
    maxLength: 50,
  })
  readonly code?: string;

  @StringFieldOptional({
    description: 'CONSUMABLE: tên vật tư mới — bỏ trống thì giữ tên bản gốc',
    maxLength: 255,
  })
  readonly name?: string;
}
