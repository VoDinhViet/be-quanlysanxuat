import { DateFieldOptional } from '../../../decorators/field.decorators';

export class GetProductionProgressReqDto {
  @DateFieldOptional({
    description:
      'Lọc theo orders.dueDate của đơn hàng gốc — trùng cột lọc của GET /production-jobs. Bỏ trống = tất cả Job.',
  })
  readonly startDate?: Date;

  @DateFieldOptional({
    description: 'Xem mô tả startDate.',
  })
  readonly endDate?: Date;
}
