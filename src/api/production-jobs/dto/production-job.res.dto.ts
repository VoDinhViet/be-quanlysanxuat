import { Exclude, Expose, Transform } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import { OrderClientRefResDto } from '../../orders/dto/order-client-ref.res.dto';
import { OrderCreatorResDto } from '../../orders/dto/order-creator.res.dto';
import { OrderItemProductRefResDto } from '../../orders/dto/order-item-product-ref.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

/**
 * Một Job sản xuất — `GET /production-jobs`/`GET /production-jobs/:jobId`, menu "Quản lý sản
 * xuất". 1 sản phẩm (FG) = 1 Job trong một LSX; `quantity` đã gộp mọi dòng PO cùng sản phẩm (xem
 * `production_jobs` trong `src/database/schemas/production.ts`).
 *
 * Map thẳng từ dòng phẳng của `ProductionJobsService.baseJobSelect()` — `client`/`product`/
 * `approver` tự gộp/coalesce qua `@Transform` bên dưới thay vì reshape tay ở service (cùng lý do
 * `toClassOnly` với `FileField`, xem `src/api/files/dto/file.field.ts`): `ClassSerializerInterceptor`
 * serialize lại DTO một lần nữa sau khi service trả về, lúc đó `obj` là instance DTO (không còn
 * các cột phẳng gốc như `productId`/`productCode`) nên transform không giới hạn sẽ ghi đè mất dữ
 * liệu đã resolve.
 *
 * `status`/`producedQty`/`rejectedQty`/`remainingQty`/`startedAt`/`completedAt` thêm 2026-07-30 —
 * vòng đời + sản lượng ở mức Job, xem `docs/features/production.md`.
 */
@Exclude()
export class ProductionJobResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Job code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Mã LSX cha' })
  productionOrderCode!: string;

  @Expose()
  @UUIDField({ description: 'Source order id' })
  orderId!: string;

  @Expose()
  @StringField({ description: 'Source order code' })
  orderCode!: string;

  @Expose()
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) => {
      const client = obj.client as { id?: string } | null | undefined;
      return client?.id ? client : null;
    },
    { toClassOnly: true },
  )
  @ClassFieldOptional(() => OrderClientRefResDto, { nullable: true })
  client!: OrderClientRefResDto | null;

  @Expose()
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) => ({
      id: obj.productId,
      code: obj.productCode,
      name: obj.productName,
      unit: obj.unit,
      imageFile: obj.imageFile,
    }),
    { toClassOnly: true },
  )
  @ClassField(() => OrderItemProductRefResDto)
  product!: OrderItemProductRefResDto;

  @Expose()
  @NumberField({ description: 'SL cần sản xuất — đã gộp theo sản phẩm' })
  quantity!: number;

  @Expose()
  @EnumField(() => ProductionJobStatus, { description: 'Trạng thái Job' })
  status!: ProductionJobStatus;

  @Expose()
  @NumberField({ description: 'SL đạt đã báo — cộng dồn qua từng lần báo' })
  producedQty!: number;

  @Expose()
  @NumberField({ description: 'SL phế đã báo — cộng dồn qua từng lần báo' })
  rejectedQty!: number;

  @Expose()
  @NumberField({
    description: 'Còn lại = quantity − producedQty − rejectedQty',
  })
  remainingQty!: number;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm bắt đầu sản xuất',
  })
  startedAt!: Date | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm hoàn thành Job',
  })
  completedAt!: Date | null;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) => {
      const approver = obj.approver as { id?: string } | null | undefined;
      return approver?.id ? approver : null;
    },
    { toClassOnly: true },
  )
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  approver!: OrderCreatorResDto | null;

  @Expose()
  @DateField({ description: 'Thời điểm duyệt LSX' })
  approvedAt!: Date;
}
