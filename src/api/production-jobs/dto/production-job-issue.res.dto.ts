import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobItemResDto {
  @Expose()
  @StringField({ description: 'Mã vật tư — snapshot lúc duyệt LSX' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư — snapshot lúc duyệt LSX' })
  name!: string;
}

@Exclude()
export class ProductionJobUnitResDto {
  @Expose()
  @StringField({ description: 'Mã ĐVT — snapshot lúc duyệt LSX' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên ĐVT — snapshot lúc duyệt LSX' })
  name!: string;
}

@Exclude()
export class ProductionJobIssueResDto {
  @Expose()
  @ClassField(() => ProductionJobItemResDto)
  item!: ProductionJobItemResDto;

  @Expose()
  @ClassField(() => ProductionJobUnitResDto)
  unit!: ProductionJobUnitResDto;

  @Expose()
  @NumberField({
    description: 'Nhu cầu vật tư của Job — định mức BOM × SL Job',
  })
  requiredQty!: number;

  @Expose()
  @NumberField({
    description:
      'Đã lãnh — Σ SL lãnh mọi phiếu lãnh vật tư ISSUED cùng (Job, vật tư), xem docs/domains/inventory.md',
  })
  issuedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'Còn phải lãnh = max(requiredQty − issuedQuantity, 0)',
  })
  remainingQuantity!: number;
}
