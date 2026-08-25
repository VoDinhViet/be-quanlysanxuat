import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import { BomOperationResDto } from '../../bom-operations/dto/bom-operation.res.dto';
import { ItemType } from '../../../database/schemas';
import {
  ClassField,
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
    description: 'null for top-level items',
  })
  parentId!: string | null;

  @Expose()
  @UUIDField({ description: 'Id of the linked item (WIP hoặc RM)' })
  itemId!: string;

  @Expose()
  @EnumField(() => ItemType, { description: 'WIP (node) hoặc RM (lá)' })
  itemType!: ItemType;

  @Expose()
  @StringField({ description: 'Mã bản vẽ (linked item code)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên bản vẽ (linked item name)' })
  name!: string;

  @Expose()
  @ClassFieldOptional(() => FileResDto, {
    nullable: true,
    description: 'Cột Hình',
  })
  image!: FileResDto | null;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @NumberField({
    description: 'Số lượng — nguyên nếu node là WIP, có thể lẻ nếu là RM',
  })
  quantity!: number;

  @Expose()
  @NumberField({ int: true, description: 'Deterministic sibling ordering' })
  sortOrder!: number;

  @Expose()
  @NumberField({
    int: true,
    description: 'Độ sâu 1-based — node top-level (parentId null) = 1',
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
