import { Exclude, Expose } from 'class-transformer';

import { ItemType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';
import { StockStatus } from '../inventory.constant';

@Exclude()
export class InventoryItemResDto {
  @Expose()
  @UUIDField({ description: 'Item id' })
  id!: string;

  @Expose()
  @StringField({ description: 'Item code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Item name' })
  name!: string;

  @Expose()
  @EnumField(() => ItemType)
  type!: ItemType;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

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
    description:
      'Đã giữ cho các đơn hàng đã duyệt còn mở, trừ phần đã xuất giao — chỉ khác 0 với FG',
  })
  reserved!: number;

  @Expose()
  @NumberField({
    description: 'Tổng nhu cầu BOM — luôn 0 ở đợt này, chưa nổ BOM',
  })
  bomDemand!: number;

  @Expose()
  @NumberField({
    description: 'Tồn khả dụng = onHand − reserved − bomDemand',
  })
  available!: number;

  @Expose()
  @NumberField({
    description: 'Định mức tồn tối thiểu — chỉ có ý nghĩa với RM',
  })
  minStock!: number;

  @Expose()
  @EnumField(() => StockStatus)
  status!: StockStatus;
}
