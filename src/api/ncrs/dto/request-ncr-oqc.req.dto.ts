import { NumberFieldOptional } from '../../../decorators/field.decorators';

export class RequestNcrOqcReqDto {
  @NumberFieldOptional({
    isPositive: true,
    description: 'SL kiểm lại — mặc định = SL sửa chữa + làm mới',
  })
  readonly quantity?: number;
}
