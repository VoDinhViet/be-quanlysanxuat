import { Exclude, Expose } from 'class-transformer';

import { MaterialType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';
import { MaterialRefResDto } from '../../materials/dto/material-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { MaterialStockStatus } from '../inventory.constant';

/**
 * One material's stock levels for `GET /inventory/materials`.
 *
 * Rules:
 * - `reserved`/`bomDemand` luôn `0` ở đợt này — chưa có Phiếu lãnh vật tư, chưa nổ BOM.
 * - `issuable = onHand − reserved`, `available = onHand − bomDemand` — hai công thức khác nhau,
 *   trùng giá trị chỉ vì `reserved`/`bomDemand` đang là `0`.
 *
 * See `docs/features/inventory.md`.
 */
@Exclude()
export class MaterialInventoryItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @EnumField(() => MaterialType)
  type!: MaterialType;

  @Expose()
  @ClassField(() => MaterialRefResDto)
  unit!: MaterialRefResDto;

  @Expose()
  @ClassField(() => MaterialRefResDto)
  group!: MaterialRefResDto;

  @Expose()
  @ClassFieldOptional(() => SupplierRefResDto, { nullable: true })
  supplier!: SupplierRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => FileResDto, { nullable: true })
  image!: FileResDto | null;

  @Expose()
  @NumberField({
    description: 'Tồn thực tế — Σ IN − Σ OUT trên các phiếu chưa xoá',
  })
  onHand!: number;

  @Expose()
  @NumberField({
    description: 'Đã giữ — luôn 0 ở đợt này, chưa có Phiếu lãnh vật tư',
  })
  reserved!: number;

  @Expose()
  @NumberField({ description: 'Có thể xuất = onHand − reserved' })
  issuable!: number;

  @Expose()
  @NumberField({
    description: 'Tổng nhu cầu BOM — luôn 0 ở đợt này, chưa nổ BOM',
  })
  bomDemand!: number;

  @Expose()
  @NumberField({ description: 'Tồn khả dụng = onHand − bomDemand' })
  available!: number;

  @Expose()
  @NumberField({ description: 'Định mức tồn tối thiểu' })
  minStock!: number;

  @Expose()
  @EnumField(() => MaterialStockStatus)
  status!: MaterialStockStatus;
}
