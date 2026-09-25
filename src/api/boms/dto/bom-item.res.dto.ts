import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import { BomOperationResDto } from '../../bom-operations/dto/bom-operation.res.dto';
import { BomType } from '../../../database/schemas';
import {
  BooleanField,
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
    description: 'null nghĩa là con trực tiếp của Cấp 0 — không có cha thật',
  })
  parentId!: string | null;

  @Expose()
  @EnumField(() => BomType, {
    description:
      'COMPONENT (node cấu trúc con, không trỏ item) hoặc DIRECT (lá, trỏ vật tư) — Cấp 0 ' +
      '(chính sản phẩm) không nằm trong mảng này, đọc qua GET /items/:itemId',
  })
  type!: BomType;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Id vật tư liên kết (DIRECT); null với node COMPONENT',
  })
  itemId!: string | null;

  @Expose()
  @StringField({
    description:
      'Mã bản vẽ — COMPONENT: nhập tay trên node; DIRECT: đọc từ item liên kết',
  })
  code!: string;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Phiên bản item liên kết (DIRECT); null với node COMPONENT',
  })
  revision!: string | null;

  @Expose()
  @StringField({
    description:
      'Tên bản vẽ — COMPONENT: nhập tay trên node; DIRECT: đọc từ item liên kết',
  })
  name!: string;

  @Expose()
  @ClassFieldOptional(() => FileResDto, {
    nullable: true,
    description:
      'DIRECT: ảnh item liên kết; COMPONENT: ảnh riêng gán trên node (null nếu chưa gán)',
  })
  image!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => UnitRefResDto, {
    nullable: true,
    description:
      'DIRECT: ĐVT của item liên kết; COMPONENT: ĐVT riêng gán trên node (null nếu chưa gán)',
  })
  unit!: UnitRefResDto | null;

  @Expose()
  @NumberField({
    description: 'Số lượng — nguyên nếu COMPONENT, có thể lẻ nếu DIRECT',
  })
  quantity!: number;

  @Expose()
  @NumberField({ int: true, description: 'Deterministic sibling ordering' })
  sortOrder!: number;

  @Expose()
  @NumberField({
    int: true,
    description: 'Độ sâu — con trực tiếp của Cấp 0 = 1',
  })
  level!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @NumberField({
    int: true,
    each: true,
    isArray: true,
    description:
      'Vị trí trong cây, dạng mảng rank anh em từng cấp — con trực tiếp của Cấp 0 bắt đầu từ ' +
      '[1], ví dụ [1,2] nghĩa là con thứ 1 của Cấp 0 rồi con thứ 2 của node đó. Đã tính sẵn ' +
      'trong BomsService.getBomItem — mảng trả về đã đúng thứ tự depth-first, FE không cần tự ' +
      'dựng lại cây nữa.',
  })
  path!: number[];

  @Expose()
  @ClassField(() => BomOperationResDto, {
    each: true,
    description:
      'Chuỗi công đoạn gắn trên node này, đã sắp theo sortOrder — DIRECT luôn rỗng (không gắn được công đoạn)',
  })
  operations!: BomOperationResDto[];
  @Expose()
  @BooleanField({
    description:
      'true nếu là vật tư ngoài cấu trúc — đứng ngay sau node chủ (`parentId`, null = Cấp 0) và không chiếm số thứ tự anh em',
  })
  isOffStructure!: boolean;
}
