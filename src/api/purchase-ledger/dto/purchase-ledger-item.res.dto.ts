import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { PurchaseRequestRefResDto } from '../../purchase-requests/dto/purchase-request-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import { PurchaseLedgerStatus } from '../purchase-ledger.constant';

@Exclude()
export class PurchaseLedgerItemResDto {
  @Expose()
  @UUIDField({
    description: 'Id của purchase_request_items — khoá chính của dòng sổ cái',
  })
  id!: string;

  @Expose()
  @ClassField(() => PurchaseRequestRefResDto)
  purchaseRequest!: PurchaseRequestRefResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @FileField('imageFile', 'Ảnh vật tư')
  image!: FileResDto | null;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @ClassFieldOptional(() => ProductionOrderRefResDto, { nullable: true })
  productionOrder!: ProductionOrderRefResDto | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú của dòng vật tư trong đề xuất',
  })
  note!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description:
      'Số PO khách hàng của đơn hàng gốc (orders.buyerPoNo, qua LSX gắn với đề xuất) — cột "PO liên quan / Lý do" ưu tiên hiện số này',
  })
  buyerPoNo!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description:
      'Lý do / ghi chú ở đầu phiếu đề xuất — cột "PO liên quan / Lý do" hiện khi không có buyerPoNo',
  })
  requestNote!: string | null;

  @Expose()
  @NumberField({ description: 'SL cần mua (từ đề xuất)' })
  quantity!: number;

  @Expose()
  @NumberField({
    description: 'SL báo giá — Σ quantity mọi dòng báo giá chưa CANCELLED',
  })
  quotedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'SL đặt mua — Σ quantity mọi dòng đơn mua chưa CANCELLED',
  })
  orderedQuantity!: number;

  @Expose()
  @NumberField({
    description:
      'SL đã nhập kho — Σ quantity mọi dòng phiếu nhập kho POSTED trừ hàng trả NCC',
  })
  receivedQuantity!: number;

  @Expose()
  @DateField({ description: 'Ngày tạo phiếu đề xuất' })
  createdAt!: Date;

  @Expose()
  @DateField({ description: 'Ngày cần (của đề xuất)' })
  neededDate!: Date;

  @Expose()
  @EnumField(() => PurchaseLedgerStatus)
  status!: PurchaseLedgerStatus;
}
