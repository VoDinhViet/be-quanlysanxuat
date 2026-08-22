import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  NumberFieldOptional,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class QcAqlRuleResDto {
  @Expose()
  @UUIDField({ description: 'Rule id' })
  readonly id!: string;

  @Expose()
  @StringField({ maxLength: 2, description: 'Code letter (ANSI/ASQ Z1.4)' })
  readonly codeLetter!: string;

  @Expose()
  @NumberField({ int: true, isPositive: true, description: 'Lot size từ' })
  readonly lotSizeMin!: number;

  @Expose()
  @NumberFieldOptional({
    int: true,
    isPositive: true,
    nullable: true,
    description: 'Lot size đến — null nghĩa là vô cực',
  })
  readonly lotSizeMax!: number | null;

  @Expose()
  @NumberField({ int: true, isPositive: true, description: 'Cỡ mẫu (n)' })
  readonly sampleSize!: number;

  @Expose()
  @NumberField({ int: true, min: 0, description: 'Số lỗi chấp nhận (Ac)' })
  readonly acceptanceNumber!: number;

  @Expose()
  @NumberField({ int: true, min: 0, description: 'Số lỗi từ chối (Re)' })
  readonly rejectionNumber!: number;
}
