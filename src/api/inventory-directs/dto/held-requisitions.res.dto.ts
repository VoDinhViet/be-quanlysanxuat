import { Exclude, Expose } from 'class-transformer';

import { OffsetPaginationDto } from '../../../common/dto/offset-pagination/offset-pagination.dto';
import { ClassField, NumberField } from '../../../decorators/field.decorators';
import { HeldRequisitionResDto } from './held-requisition.res.dto';

/** Trang `OffsetPaginatedDto` kèm tổng số lượng giữ của toàn bộ kết quả lọc, để dòng TỔNG CỘNG
 * đúng cả khi có nhiều trang. */
@Exclude()
export class HeldRequisitionsResDto {
  @Expose()
  @ClassField(() => HeldRequisitionResDto, { each: true, isArray: true })
  readonly data: HeldRequisitionResDto[];

  @Expose()
  @ClassField(() => OffsetPaginationDto)
  readonly pagination: OffsetPaginationDto;

  @Expose()
  @NumberField({ description: 'Σ số lượng giữ của mọi dòng khớp bộ lọc' })
  readonly totalQuantity: number;

  constructor(
    data: HeldRequisitionResDto[],
    pagination: OffsetPaginationDto,
    totalQuantity: number,
  ) {
    this.data = data;
    this.pagination = pagination;
    this.totalQuantity = totalQuantity;
  }
}
