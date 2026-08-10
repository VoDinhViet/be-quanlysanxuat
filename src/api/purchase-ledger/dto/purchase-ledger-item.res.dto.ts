import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderItemRefResDto } from '../../orders/dto/order-item-ref.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { PurchaseRequestRefResDto } from '../../purchase-requests/dto/purchase-request-ref.res.dto';
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
  @ClassField(() => OrderItemRefResDto)
  item!: OrderItemRefResDto;

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
  @NumberField({ description: 'SL đề xuất' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã đặt mua — Σ dòng đơn mua chưa CANCELLED' })
  orderedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'SL đã nhập kho — Σ dòng phiếu nhập POSTED nối qua đơn mua',
  })
  receivedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'SL còn lại = orderedQuantity − receivedQuantity',
  })
  remainingQuantity!: number;

  @Expose()
  @NumberField({ description: 'Tồn hiện tại (gộp mọi kho), đọc lúc gọi API' })
  onHand!: number;

  @Expose()
  @NumberField({
    description:
      'Nhu cầu BOM — của Job liên quan, hoặc mọi Job của LSX nếu không có Job cụ thể',
  })
  bomDemand!: number;

  @Expose()
  @NumberField({ description: 'Tồn khả dụng = onHand − bomDemand, có thể âm' })
  available!: number;

  @Expose()
  @NumberField({
    description:
      'Phần tồn thực tế bị nhu cầu LSX này chiếm = min(onHand, bomDemand)',
  })
  fromStock!: number;

  @Expose()
  @DateField({ description: 'Ngày cần (của đề xuất)' })
  neededDate!: Date;

  @Expose()
  @DateField({ description: 'Ngày tạo phiếu đề xuất' })
  createdAt!: Date;

  @Expose()
  @EnumField(() => PurchaseLedgerStatus)
  status!: PurchaseLedgerStatus;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description:
      'Mốc chốt giá — nguồn highlight vàng (< 24h)/đỏ (≥ 24h) trên FE, chỉ có giá trị khi status = PENDING_PURCHASE',
  })
  pendingPurchaseSince!: Date | null;
}
