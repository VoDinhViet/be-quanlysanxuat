import { EnumFieldOptional } from '../../../decorators/field.decorators';
import { ClientStatus } from '../../../database/schemas';

export class GetClientStatusStatsReqDto {
  @EnumFieldOptional(() => ClientStatus, {
    description:
      'Chỉ đếm khách hàng ở trạng thái này; bỏ trống thì gộp theo trạng thái',
  })
  readonly status?: ClientStatus;
}
