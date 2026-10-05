import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class InventoryRequisitionItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @FileField('imageFile', 'Ảnh vật tư')
  image!: FileResDto | null;

  @Expose()
  @NumberField({ description: 'SL lãnh' })
  quantity!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'SL BOM tại thời điểm đọc, null nếu phiếu không gắn Job',
  })
  bomQuantity!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'Đã lãnh (mọi phiếu ISSUED khác cùng Job), null nếu phiếu không gắn Job',
  })
  issuedQuantity!: number | null;

  @Expose()
  @NumberField({ description: 'Tồn thực tế' })
  onHand!: number;

  @Expose()
  @NumberField({ description: 'Đã giữ tại thời điểm đọc' })
  reservedQuantity!: number;

  @Expose()
  @NumberField({ description: 'Có thể lãnh = Tồn thực tế − Đã giữ' })
  issuableQuantity!: number;

  @Expose()
  @NumberField({
    description:
      'Khả dụng của hệ thống (cùng công thức màn Tồn kho vật tư), có thể âm, chỉ tham khảo',
  })
  availableQuantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}
