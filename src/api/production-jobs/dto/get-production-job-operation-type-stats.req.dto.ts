import { OperationType } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetProductionJobOperationTypeStatsReqDto {
  @EnumFieldOptional(() => OperationType, {
    description:
      'Chỉ loại công đoạn này, OUTSOURCE là gia công ngoài; bỏ trống thì gộp theo loại',
  })
  readonly type?: OperationType;
}
