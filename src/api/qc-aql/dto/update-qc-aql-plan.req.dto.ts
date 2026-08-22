import {
  BooleanFieldOptional,
  ClassFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { QcAqlRuleReqDto } from './qc-aql-rule.req.dto';

export class UpdateQcAqlPlanReqDto {
  @StringFieldOptional({ maxLength: 255, description: 'Tên plan' })
  readonly name?: string;

  @StringFieldOptional({ maxLength: 100, description: 'Tiêu chuẩn áp dụng' })
  readonly standard?: string;

  @BooleanFieldOptional({ description: 'Còn dùng để tra AQL hay không' })
  readonly isActive?: boolean;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú' })
  readonly note?: string;

  @ClassFieldOptional(() => QcAqlRuleReqDto, {
    each: true,
    description: 'Xoá + chèn lại toàn bộ rule của plan nếu gửi field này',
  })
  readonly rules?: QcAqlRuleReqDto[];
}
