import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  ClassFieldOptional,
  NumberField,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { OrderAttachmentResDto } from './order-attachment.res.dto';
import { OrderBaseResDto } from './order-base.res.dto';

@Exclude()
export class OrderResDto extends OrderBaseResDto {
  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  assignedUser!: UserRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  approverBy!: UserRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  rejecterBy!: UserRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @NumberField({
    description:
      'TỔNG THANH TOÁN quy đổi VND — server-computed: total * exchangeRate',
  })
  totalVnd!: number;

  @Expose()
  @BooleanField({
    description:
      'Derived, not stored: dueDate < now && status not in (COMPLETED, CANCELLED)',
  })
  expired!: boolean;

  @Expose()
  @ClassFieldOptional(() => OrderAttachmentResDto, { each: true })
  attachments!: OrderAttachmentResDto[];
}
