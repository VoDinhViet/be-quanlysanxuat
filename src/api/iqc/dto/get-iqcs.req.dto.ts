import {
  IqcDisposition,
  IqcResult,
  IqcStatus,
} from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetIqcsReqDto extends PageOptionsDto {
  @StringFieldOptional({ description: 'Tìm theo tên hoặc mã vật tư' })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @UUIDFieldOptional({ description: 'Filter theo khách hàng gửi trả' })
  readonly clientId?: string;

  @StringFieldOptional({ description: 'Tìm theo mã PO' })
  readonly poCode?: string;

  @StringFieldOptional({ description: 'Tìm theo mã phiếu nhập kho' })
  readonly nkCode?: string;

  @EnumFieldOptional(() => IqcResult)
  readonly result?: IqcResult;

  @EnumFieldOptional(() => IqcDisposition)
  readonly disposition?: IqcDisposition;

  @EnumFieldOptional(() => IqcStatus)
  readonly status?: IqcStatus;
}
