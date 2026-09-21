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

  // Không phải cột riêng của `supplier_returns` — lấy từ `qc_inspections.dispositionNote` của lần
  // IQC đã sinh ra phiếu này (qua `qcInspectionId`), nơi QC ghi lý do khi chọn
  // `disposition = RETURN`/`SORT`. `null` khi phiếu không sinh từ IQC hoặc QC không ghi lý do.
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
