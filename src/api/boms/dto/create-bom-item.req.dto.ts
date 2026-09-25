import { BomType } from '../../../database/schemas';
import {
  BooleanFieldOptional,
  EnumField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateBomItemReqDto {
  @EnumField(() => BomType, {
    description:
      'COMPONENT: node cấu trúc con — gửi code + name, không gửi itemId; thêm vào node đang có vật tư thì ' +
      'toàn bộ DIRECT cùng cha bị xoá ngầm. DIRECT: lá vật tư — gửi itemId, không gửi code/name; ' +
      'chỉ gắn được vào node chưa có con COMPONENT (E273). Sai hình dạng → E271',
  })
  readonly type!: BomType;

  @UUIDFieldOptional({
    description: 'Id vật tư (type = DIRECT) — phải là item type DIRECT (E270)',
  })
  readonly itemId?: string;

  @StringFieldOptional({
    maxLength: 50,
    description:
      'Mã node (type = COMPONENT) — nhập tay, riêng cho vị trí này trong cây',
  })
  readonly code?: string;

  @StringFieldOptional({
    maxLength: 255,
    description: 'Tên node (type = COMPONENT)',
  })
  readonly name?: string;

  @UUIDFieldOptional({
    description:
      'ĐVT riêng của node (type = COMPONENT) — chọn tự do, không giới hạn theo unit scope. Gửi cho DIRECT → E271',
  })
  readonly unitId?: string;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Ảnh riêng của node (type = COMPONENT, từ POST /files?type=BOM_ITEM_IMAGE). Gửi cho DIRECT → E271',
  })
  readonly imageFileId?: string | null;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Id node cha (bom_items); omit/null nghĩa là con trực tiếp của Cấp 0. Cha là DIRECT → ' +
      'E052; cha đã có con COMPONENT mà thêm DIRECT → E273',
  })
  readonly parentId?: string | null;

  @NumberField({
    isPositive: true,
    description:
      'SL — nguyên nếu type là COMPONENT (E055 nếu lẻ), có thể lẻ nếu type là DIRECT',
  })
  readonly quantity!: number;

  @BooleanFieldOptional({
    description:
      'true: vật tư ngoài cấu trúc (type = DIRECT) — gắn được cạnh node COMPONENT (bỏ E273), không bị xoá ngầm khi ' +
      'node cha có thêm con COMPONENT. Gửi cho COMPONENT → E271',
  })
  readonly isOffStructure?: boolean;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'Sibling order; defaults to 0',
  })
  readonly sortOrder?: number;

  @StringFieldOptional({ nullable: true, maxLength: 1000 })
  readonly note?: string | null;
}
