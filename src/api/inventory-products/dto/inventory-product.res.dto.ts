import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

/** Không trả `status`/`minStock` — minStock luôn 0 với FG nên FE tự suy status từ dấu `available`
 * (`docs/domains/inventory.md`). `GET /inventory-products?status=` vẫn lọc được — filter chạy
 * thẳng trên SQL, không cần hiển thị field. */
@Exclude()
export class InventoryProductResDto {
  @Expose()
  @UUIDField({ description: 'Item id' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã thành phẩm' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên thành phẩm' })
  name!: string;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

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
      'Đã giữ — Σ SL lệnh giao hàng (DO) đang PENDING_APPROVAL/PENDING_DELIVERY',
  })
  reserved!: number;

  @Expose()
  @NumberField({
    description: 'Nhu cầu đơn hàng mở chưa có DO nào giữ',
  })
  bomDemand!: number;

  @Expose()
  @NumberField({
    description: 'Tồn khả dụng = onHand − reserved − bomDemand',
  })
  available!: number;
}
