import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class ProductionOrderStatusStatResDto {
  @Expose()
  @StringField({ description: 'Trạng thái LSX: PENDING, APPROVED, COMPLETED' })
  status!: string;

  @Expose()
  @NumberField({ description: 'Số lệnh sản xuất (LSX)', int: true })
  productionOrderCount!: number;
}
