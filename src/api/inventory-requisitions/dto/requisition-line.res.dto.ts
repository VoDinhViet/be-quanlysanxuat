import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  BooleanField,
  NumberFieldOptional,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class RequisitionLineResDto {
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
  @NumberFieldOptional({
    nullable: true,
    description:
      'SL BOM — production_job_issues.requiredQty, null nếu không có Job',
  })
  bomQuantity!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'Đã lãnh — Σ SL lãnh mọi phiếu ISSUED cùng Job này, null nếu không có Job',
  })
  issuedQuantity!: number | null;

  @Expose()
  @NumberField({ description: 'Tồn thực tế tại kho đang chọn' })
  onHand!: number;

  @Expose()
  @NumberField({
    description:
      'Đã giữ — Σ SL lãnh mọi phiếu đang APPROVED cùng (kho, vật tư)',
  })
  reservedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'Có thể lãnh = Tồn thực tế − Đã giữ (chặn khi tạo/duyệt)',
  })
  issuableQuantity!: number;

  @Expose()
  @NumberField({
    description:
      'Khả dụng của hệ thống (cùng công thức màn Tồn kho vật tư), có thể âm, chỉ tham khảo',
  })
  availableQuantity!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'SL lãnh gợi ý = max(0, min(SL BOM − Đã lãnh, Có thể lãnh)), null nếu không có Job',
  })
  suggestedQuantity!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'SL BOM còn lại chưa lãnh = max(0, SL BOM − Đã lãnh), null nếu không có Job',
  })
  remainingBom!: number | null;

  @Expose()
  @BooleanField({
    description:
      'true nếu vật tư của Job này đã lãnh đủ định mức BOM (issuedQuantity >= bomQuantity)',
  })
  isFullyIssued!: boolean;
}
