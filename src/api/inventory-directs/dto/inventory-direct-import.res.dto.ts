import { Exclude, Expose } from 'class-transformer';

import { InventoryAdjustmentType } from '../../../database/schemas';
import {
  ClassField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class InventoryDirectImportDocumentResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu điều chỉnh (PDC-YYYY-NNNNN)' })
  code!: string;

  @Expose()
  @EnumField(() => InventoryAdjustmentType)
  adjustmentType!: InventoryAdjustmentType;

  @Expose()
  @NumberField({ int: true })
  itemCount!: number;
}

@Exclude()
export class InventoryDirectImportResDto {
  @Expose()
  @ClassField(() => InventoryDirectImportDocumentResDto, { each: true })
  documents!: InventoryDirectImportDocumentResDto[];

  @Expose()
  @NumberField({
    int: true,
    description: 'Số dòng có tồn thực tế bằng tồn hiện tại',
  })
  unchangedCount!: number;
}
