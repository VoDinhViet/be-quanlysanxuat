import { Exclude, Expose } from 'class-transformer';

import {
  IqcDisposition,
  IqcInspectionLevel,
  IqcResult,
  IqcStatus,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import { InventoryReceiptRefResDto } from '../../inventory-receipts/dto/inventory-receipt-ref.res.dto';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { OutsourcingReceiptRefResDto } from '../../outsourcing-receipts/dto/outsourcing-receipt-ref.res.dto';
import { ProductionJobOperationRefResDto } from '../../production-jobs/dto/production-job-operation-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { PurchaseOrderRefResDto } from '../../purchase-orders/dto/purchase-order-ref.res.dto';
import { SupplierReturnRefResDto } from '../../supplier-returns/dto/supplier-return-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { IqcAttachmentResDto } from './iqc-attachment.res.dto';

@Exclude()
export class IqcResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã IQC' })
  code!: string;

  @Expose()
  @ClassFieldOptional(() => InventoryReceiptRefResDto, { nullable: true })
  inventoryReceipt!: InventoryReceiptRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => OutsourcingReceiptRefResDto, { nullable: true })
  outsourcingReceipt!: OutsourcingReceiptRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, {
    nullable: true,
    description:
      'LSX liên quan — chỉ có khi phiếu sinh từ OS-IN của một công đoạn gia công ngoài',
  })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobOperationRefResDto, {
    nullable: true,
    description:
      'Công đoạn gia công ngoài liên quan — cùng điều kiện productionJob',
  })
  productionJobOperation!: ProductionJobOperationRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => PurchaseOrderRefResDto, { nullable: true })
  purchaseOrder!: PurchaseOrderRefResDto | null;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'Số lượng kiểm (Lot size)' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày kiểm' })
  inspectionDate!: Date;

  @Expose()
  @EnumFieldOptional(() => IqcResult, { nullable: true })
  result!: IqcResult | null;

  @Expose()
  @EnumFieldOptional(() => IqcDisposition, { nullable: true })
  disposition!: IqcDisposition | null;

  @Expose()
  @EnumField(() => IqcStatus)
  status!: IqcStatus;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Lý do kiểm' })
  reason!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú kết quả' })
  resultNote!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú quyết định' })
  dispositionNote!: string | null;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'SL OK khi Phân loại' })
  sortOkQty!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'SL NG (trả NCC) khi Phân loại',
  })
  sortNgQty!: number | null;

  @Expose()
  @ClassFieldOptional(() => DepartmentResDto, { nullable: true })
  qcDepartment!: DepartmentResDto | null;

  @Expose()
  @ClassField(() => IqcAttachmentResDto, { each: true })
  qcEvidence!: IqcAttachmentResDto[];

  @Expose()
  @ClassField(() => IqcAttachmentResDto, { each: true })
  dispositionEvidence!: IqcAttachmentResDto[];

  @Expose()
  @ClassFieldOptional(() => SupplierReturnRefResDto, {
    nullable: true,
    description:
      'Phiếu trả NCC tự sinh khi disposition SORT/RETURN — null nếu chưa/không có',
  })
  supplierReturn!: SupplierReturnRefResDto | null;

  @Expose()
  @EnumFieldOptional(() => IqcInspectionLevel, {
    nullable: true,
    description: 'Mức kiểm tra (Inspection Level) đã dùng lúc xác nhận QC',
  })
  inspectionLevel!: IqcInspectionLevel | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'Mức AQL (%) đã dùng lúc xác nhận QC',
  })
  aqlLevel!: number | null;

  @Expose()
  @NumberFieldOptional({ int: true, nullable: true, description: 'Cỡ mẫu' })
  sampleSize!: number | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description: 'Số lượng lỗi đếm được trong mẫu',
  })
  defectQty!: number | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Tiêu chuẩn kiểm — vd VT-0152 Rev.02',
  })
  inspectionStandard!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Tên người kiểm thực tế',
  })
  inspectorName!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Dụng cụ đo đã dùng' })
  measuringTools!: string | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description: 'Số lỗi chấp nhận (Ac) — tra từ bảng AQL, không lưu cột riêng',
  })
  ac!: number | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description: 'Số lỗi từ chối (Re) — tra từ bảng AQL, không lưu cột riêng',
  })
  re!: number | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  confirmerBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Thời điểm xác nhận QC' })
  confirmedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  resolverBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm chọn phương án xử lý (disposition)',
  })
  resolvedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
