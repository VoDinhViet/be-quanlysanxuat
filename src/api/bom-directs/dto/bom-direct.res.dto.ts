import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import {
  ClassFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

/**
 * Một dòng DIRECT gắn trực tiếp vào một node cha (`GET
 * items/:itemId/bom/items/:bomItemId/directs`) — cùng field DIRECT mà
 * `BomItemResDto` (cây đầy đủ) đã có, trừ những field chỉ có ý nghĩa ở ngữ cảnh cây
 * (level, sortOrder, parentId, type, operations).
 */
@Exclude()
export class BomDirectResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDField({ description: 'Id item (vật tư) liên kết' })
  itemId!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  revision!: string | null;

  @Expose()
  @StringField()
  name!: string;

  @Expose()
  @ClassFieldOptional(() => FileResDto, { nullable: true })
  image!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => UnitRefResDto, { nullable: true })
  unit!: UnitRefResDto | null;

  @Expose()
  @NumberField({ description: 'Số lượng định mức (có thể lẻ)' })
  quantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}
