import {
  ClassField,
  DateField,
  DateFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { CreateQuotationItemReqDto } from './create-quotation-item.req.dto';

export class CreateQuotationReqDto {
  @UUIDField({ description: 'Nhà cung cấp được hỏi giá' })
  readonly supplierId!: string;

  @DateField({ description: 'Ngày lập báo giá' })
  readonly quotationDate!: Date;

  @DateFieldOptional({ nullable: true, description: 'Hạn hiệu lực báo giá' })
  readonly validUntil?: Date | null;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => CreateQuotationItemReqDto, { each: true })
  readonly items!: CreateQuotationItemReqDto[];
}
