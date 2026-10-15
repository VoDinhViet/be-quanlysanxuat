import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { FileResDto } from '../../files/dto/file.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { SupplierReturnBaseResDto } from './supplier-return-base.res.dto';

@Exclude()
export class SupplierReturnResDto extends SupplierReturnBaseResDto {
  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm xác nhận xuất trả',
  })
  postedAt!: Date | null;

  // Lấy từ `supplier_returns.note`; nếu `null` thì lấy `dispositionNote` của
  // `quality_inspection_results` (lần IQC sinh phiếu, nơi QC ghi lý do khi chọn RETURN/SORT).
  // `null` khi phiếu không sinh từ IQC hoặc không có lý do.
  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Lý do trả (từ IQC)' })
  returnReason!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú xuất trả' })
  postNote!: string | null;

  @Expose()
  @ClassField(() => FileResDto, {
    each: true,
    description: 'File đính kèm lúc xác nhận xuất trả',
  })
  files!: FileResDto[];
}
