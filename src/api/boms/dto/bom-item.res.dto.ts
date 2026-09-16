import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import { BomOperationResDto } from '../../bom-operations/dto/bom-operation.res.dto';
import { BomType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class BomItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description:
      'null chỉ với node ROOT ("Cấp 0") — mọi node khác đều có cha thật',
  })
  parentId!: string | null;

  @Expose()
  @EnumField(() => BomType, {
    description:
      'COMPONENT (node cấu trúc con, không trỏ item), CONSUMABLE (lá, trỏ vật tư), hoặc ROOT (đúng 1 mỗi cây — chính sản phẩm, "Cấp 0")',
  })
  type!: BomType;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description:
      'Id item liên kết (CONSUMABLE: vật tư; ROOT: chính sản phẩm); null với node COMPONENT',
  })
  itemId!: string | null;

  @Expose()
  @StringField({
    description:
      'Mã bản vẽ — COMPONENT: nhập tay trên node; CONSUMABLE/ROOT: đọc từ item liên kết',
  })
  code!: string;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description:
      'Phiên bản item liên kết (CONSUMABLE/ROOT); null với node COMPONENT',
  })
  revision!: string | null;

  @Expose()
  @StringField({
    description:
      'Tên bản vẽ — COMPONENT: nhập tay trên node; CONSUMABLE/ROOT: đọc từ item liên kết',
  })
  name!: string;

  @Expose()
  @ClassFieldOptional(() => FileResDto, {
    nullable: true,
    description: 'Cột Hình',
  })
  image!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => UnitRefResDto, {
    nullable: true,
    description:
      'ĐVT của item liên kết (CONSUMABLE/ROOT); null với node COMPONENT',
  })
  unit!: UnitRefResDto | null;

  @Expose()
  @NumberField({
    description:
      'Số lượng — nguyên nếu node là COMPONENT hoặc ROOT (ROOT luôn = 1), có thể lẻ nếu là CONSUMABLE',
  })
  quantity!: number;

  @Expose()
  @NumberField({ int: true, description: 'Deterministic sibling ordering' })
  sortOrder!: number;

  @Expose()
  @NumberField({
    int: true,
    description: 'Độ sâu tính từ ROOT — ROOT = 0, con trực tiếp của ROOT = 1',
  })
  level!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => FileResDto, {
    nullable: true,
    description: 'Bản vẽ kỹ thuật riêng của node này',
  })
  drawing!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => BomOperationResDto, { each: true })
  operations!: BomOperationResDto[];
}
