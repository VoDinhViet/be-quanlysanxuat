import { Exclude, Expose } from 'class-transformer';

import { ItemType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ProductionJobOperationResDto } from './production-job-operation.res.dto';

/** Một dòng trong danh sách phẳng cha-con của `GET /production-jobs/:jobId/bom` — FE tự dựng cây
 * qua `parentId`, backend không lồng nhau. Không gồm sản phẩm FG gốc, chỉ node BOM thật;
 * `parentId = null` là node top-level, con trực tiếp của FG. */
@Exclude()
export class ProductionJobBomItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'null = node top-level, con trực tiếp của FG',
  })
  parentId!: string | null;

  @Expose()
  @EnumField(() => ItemType)
  itemType!: ItemType;

  @Expose()
  @StringField({ description: 'Mã sản phẩm/vật tư — snapshot lúc duyệt LSX' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên sản phẩm/vật tư — snapshot lúc duyệt LSX' })
  name!: string;

  @Expose()
  @NumberField()
  quantity!: number;

  @Expose()
  @NumberField({
    description:
      'SL kế hoạch — SL Job × định mức luỹ kế theo cây cha-con, tính lúc đọc, không lưu cột',
  })
  plannedQuantity!: number;

  @Expose()
  @NumberField({
    int: true,
    description: 'Độ sâu 1-based — node top-level (parentId null) = 1',
  })
  level!: number;

  @Expose()
  @ClassFieldOptional(() => ProductionJobOperationResDto, { each: true })
  operations!: ProductionJobOperationResDto[];
}
