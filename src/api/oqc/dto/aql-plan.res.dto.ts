import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class AqlPlanResDto {
  @Expose()
  @StringField({
    description: 'Code letter tra được từ lot size + inspection level',
  })
  codeLetter!: string;

  @Expose()
  @NumberField({ int: true, description: 'Cỡ mẫu (n) — auto tính từ bảng AQL' })
  sampleSize!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số lỗi chấp nhận (Ac)' })
  ac!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số lỗi từ chối (Re)' })
  re!: number;
}
