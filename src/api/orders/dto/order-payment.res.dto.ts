import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class OrderPaymentResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({
    description:
      'Số tiền — âm nếu là bút toán đảo (huỷ một lần ghi nhận trước đó)',
  })
  amount!: number;

  @Expose()
  @DateField({ description: 'Ngày thực nhận tiền' })
  paidAt!: Date;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}
