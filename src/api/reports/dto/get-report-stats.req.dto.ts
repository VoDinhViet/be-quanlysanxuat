import { DateFieldOptional } from '../../../decorators/field.decorators';

export class GetReportStatsReqDto {
  @DateFieldOptional({
    description:
      'Lọc theo mốc ngày riêng của từng nhóm KPI (approvedAt/dueDate/startedAt/createdAt) — bỏ trống = tính đến hiện tại. Có filter thì mọi field trend/window trả null.',
  })
  readonly startDate?: Date;

  @DateFieldOptional({
    description: 'Xem mô tả startDate.',
  })
  readonly endDate?: Date;
}
