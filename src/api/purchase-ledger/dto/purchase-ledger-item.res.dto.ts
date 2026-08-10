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
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { PurchaseRequestRefResDto } from '../../purchase-requests/dto/purchase-request-ref.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';
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
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @ClassFieldOptional(() => ProductionOrderRefResDto, { nullable: true })
  productionOrder!: ProductionOrderRefResDto | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description:
      'Lý do — hiển thị khi đề xuất không gắn LSX (productionOrder null)',
  })
  note!: string | null;

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
  @DateField({ description: 'Ngày tạo phiếu đề xuất' })
  createdAt!: Date;

  @Expose()
  @DateField({ description: 'Ngày cần (của đề xuất)' })
  neededDate!: Date;

  @Expose()
  @EnumField(() => PurchaseLedgerStatus)
  status!: PurchaseLedgerStatus;
}
