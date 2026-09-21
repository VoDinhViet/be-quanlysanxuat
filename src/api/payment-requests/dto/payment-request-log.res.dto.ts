import { Exclude, Expose } from 'class-transformer';

import { PaymentRequestLogAction } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class PaymentRequestLogResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EnumField(() => PaymentRequestLogAction, { description: 'Hành động' })
  action!: PaymentRequestLogAction;

  @Expose()
  @StringField({ description: 'Nội dung log — mô tả hành động' })
  content!: string;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, {
    nullable: true,
    description: 'Người thực hiện',
  })
  performerBy!: UserRefResDto | null;

  @Expose()
  @DateField({ description: 'Thời điểm thực hiện' })
  createdAt!: Date;
}
