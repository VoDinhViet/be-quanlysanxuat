import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateFieldOptional,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { OutsourcingOrderBaseResDto } from './outsourcing-order-base.res.dto';

@Exclude()
export class OutsourcingOrderResDto extends OutsourcingOrderBaseResDto {
  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm xác nhận gửi hàng',
  })
  postedAt!: Date | null;
}
