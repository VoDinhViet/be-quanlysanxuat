import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

/** Không trả `status` đã suy diễn — FE tự tính từ `available`/`minStock` (ba ngưỡng
 * NORMAL/WARNING/SHORTAGE, `docs/domains/inventory.md`). `GET /inventory-materials?status=` vẫn
 * lọc được, filter chạy thẳng trên SQL. */
@Exclude()
export class InventoryMaterialResDto {
  @Expose()
  @UUIDField({ description: 'Item id' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã vật tư' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư' })
  name!: string;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

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
    description: 'Đã giữ — Σ SL phiếu lãnh vật tư đang APPROVED',
  })
  reserved!: number;

  @Expose()
  @NumberField({
    description: 'Nhu cầu BOM còn lại chưa có phiếu lãnh nào giữ',
  })
  bomDemand!: number;

  @Expose()
  @NumberField({
    description: 'Tồn khả dụng = onHand − reserved − bomDemand',
  })
  available!: number;

  @Expose()
  @NumberField({ description: 'Định mức tồn tối thiểu' })
  minStock!: number;
}
