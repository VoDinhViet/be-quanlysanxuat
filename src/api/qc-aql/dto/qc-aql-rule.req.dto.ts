import {
  NumberField,
  NumberFieldOptional,
  StringField,
} from '../../../decorators/field.decorators';

export class QcAqlRuleReqDto {
  @StringField({ maxLength: 2, description: 'Code letter (ANSI/ASQ Z1.4)' })
  readonly codeLetter!: string;

  @NumberField({ int: true, isPositive: true, description: 'Lot size từ' })
  readonly lotSizeMin!: number;

  @NumberFieldOptional({
    int: true,
    isPositive: true,
    description: 'Lot size đến — bỏ trống nghĩa là vô cực',
  })
  readonly lotSizeMax?: number;

  @NumberField({ int: true, isPositive: true, description: 'Cỡ mẫu (n)' })
  readonly sampleSize!: number;

  @NumberField({
    int: true,
    min: 0,
    description: 'Số lỗi chấp nhận (Ac)',
  })
  readonly acceptanceNumber!: number;

  @NumberField({
    int: true,
    min: 0,
    description: 'Số lỗi từ chối (Re) — phải lớn hơn Ac',
  })
  readonly rejectionNumber!: number;
}
