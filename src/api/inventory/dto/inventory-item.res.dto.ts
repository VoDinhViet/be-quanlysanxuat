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
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
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
    description:
      'Đã giữ bởi chứng từ: DO PENDING_APPROVAL/PENDING_DELIVERY (FG) hoặc phiếu lãnh APPROVED (RM)',
  })
  reserved!: number;

  @Expose()
  @NumberField({
    description:
      'Nhu cầu chưa có chứng từ giữ: đơn đã duyệt chưa giao (FG) hoặc BOM còn lại (RM), đã trừ phần nằm trong reserved',
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
