import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateFieldOptional,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { OutsourcingReceiptBaseResDto } from './outsourcing-receipt-base.res.dto';

@Exclude()
export class OutsourcingReceiptResDto extends OutsourcingReceiptBaseResDto {
  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Thời điểm xác nhận nhận hàng',
  })
  postedAt!: Date | null;
}
