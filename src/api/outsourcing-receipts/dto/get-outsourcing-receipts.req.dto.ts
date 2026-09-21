import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { OutsourcingReceiptStatus } from '../../../database/schemas';
import {
  BooleanFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOutsourcingReceiptsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo phiếu gửi (OS-OUT)' })
  readonly outsourcingOrderId?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => OutsourcingReceiptStatus)
  readonly status?: OutsourcingReceiptStatus;

  @BooleanFieldOptional({ description: 'Filter theo có yêu cầu QC hay không' })
  readonly requiresIqc?: boolean;

  @DateFieldOptional({ description: 'Filter: receiptDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: receiptDate <= endDate' })
  readonly endDate?: Date;
}
