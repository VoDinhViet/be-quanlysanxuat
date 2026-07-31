import { Exclude, Expose } from 'class-transformer';

import { ProductionOrderLogAction } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderCreatorResDto } from '../../orders/dto/order-creator.res.dto';

@Exclude()
export class ProductionOrderLogResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EnumField(() => ProductionOrderLogAction, { description: 'Hành động' })
  action!: ProductionOrderLogAction;

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
