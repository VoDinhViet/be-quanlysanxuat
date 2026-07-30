import { Exclude, Expose } from 'class-transformer';

import { ProductionJobLogAction } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderCreatorResDto } from '../../orders/dto/order-creator.res.dto';

/**
 * Một dòng lịch sử thao tác Job — `GET /production-jobs/:jobId/logs`. `content` đã là mô tả tiếng
 * Việt sẵn sàng hiển thị, sinh lúc ghi (`ProductionJobsService.logAction`), không phải dữ liệu thô
 * để FE tự dựng câu. Copy khuôn `ProductionOrderLogResDto`.
 */
@Exclude()
export class ProductionJobLogResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EnumField(() => ProductionJobLogAction, { description: 'Hành động' })
  action!: ProductionJobLogAction;

  @Expose()
  @StringField({ description: 'Nội dung log — mô tả hành động' })
  content!: string;

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, {
    nullable: true,
    description: 'Người thực hiện',
  })
  performer!: OrderCreatorResDto | null;

  @Expose()
  @DateField({ description: 'Thời điểm thực hiện' })
  createdAt!: Date;
}
