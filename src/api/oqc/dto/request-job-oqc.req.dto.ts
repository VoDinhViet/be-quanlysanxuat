import { NumberFieldOptional } from '../../../decorators/field.decorators';

export class RequestJobOqcReqDto {
  @NumberFieldOptional({
    isPositive: true,
    description:
      'SL của lô OQC — bỏ trống = toàn bộ SL đã hoàn thành ở công đoạn cuối mà chưa xin kiểm; tối đa bằng SL đó',
  })
  readonly quantity?: number;
}
