import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { OperationStatus, OperationType } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

/** Danh sách công đoạn có phân trang (`page`, `limit`); `q` tìm theo tên, không phân biệt dấu. */
export class GetOperationsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => OperationType, {
    description:
      'Filter by type — e.g. type=OUTSOURCE for the "Gia công ngoài" screen',
  })
  readonly type?: OperationType;

  @EnumFieldOptional(() => OperationStatus)
  readonly status?: OperationStatus;
}
