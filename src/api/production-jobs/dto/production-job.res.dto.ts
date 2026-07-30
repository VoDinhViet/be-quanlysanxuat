import { Exclude, Expose, Transform } from 'class-transformer';

import { OrderClientRefResDto } from '../../orders/dto/order-client-ref.res.dto';
import { OrderCreatorResDto } from '../../orders/dto/order-creator.res.dto';
import { OrderItemProductRefResDto } from '../../orders/dto/order-item-product-ref.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
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
