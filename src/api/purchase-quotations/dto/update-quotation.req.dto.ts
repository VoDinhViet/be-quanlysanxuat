import {
  ClassField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { CreateQuotationItemReqDto } from './create-quotation-item.req.dto';

export class UpdateQuotationReqDto {
  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => CreateQuotationItemReqDto, { each: true })
  readonly items!: CreateQuotationItemReqDto[];
}
