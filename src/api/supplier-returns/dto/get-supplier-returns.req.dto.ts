import { InventoryDocumentStatus } from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetSupplierReturnsReqDto extends PageOptionsDto {
  @StringFieldOptional({ description: 'Tìm theo tên hoặc mã vật tư' })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @StringFieldOptional({ description: 'Tìm theo mã PO' })
  readonly poCode?: string;

  @StringFieldOptional({ description: 'Tìm theo mã IQC' })
  readonly iqcCode?: string;

  @StringFieldOptional({ description: 'Tìm theo mã phiếu nhập kho' })
  readonly nkCode?: string;

  @EnumFieldOptional(() => InventoryDocumentStatus)
  readonly status?: InventoryDocumentStatus;
}
