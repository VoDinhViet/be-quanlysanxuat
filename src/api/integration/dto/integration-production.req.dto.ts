import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import {
  INTEGRATION_MAX_DAYS,
  LimitReqDto,
  STATUS_CODE_PATTERN,
} from './integration-common.dto';

const STATUS_FIELD = {
  pattern: STATUS_CODE_PATTERN,
  patternMessage: 'Mã trạng thái là chữ hoa và gạch dưới',
  maxLength: 41,
};

export class ProductionJobsByItemReqDto {
  @StringFieldOptional({ ...STATUS_FIELD, description: 'Mặc định COMPLETED' })
  readonly status?: string;
}

export class LateJobOperationsReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_DAYS,
    description:
      'Chỉ công đoạn không có báo cáo tiến độ trong ngần ấy ngày (hoặc chưa từng báo cáo)',
  })
  readonly staleDays?: number;
}

export class OperationsByTypeReqDto {
  @StringFieldOptional({
    ...STATUS_FIELD,
    description:
      'Loại công đoạn, ví dụ OUTSOURCE là gia công ngoài; bỏ trống thì gộp theo loại',
  })
  readonly type?: string;
}
