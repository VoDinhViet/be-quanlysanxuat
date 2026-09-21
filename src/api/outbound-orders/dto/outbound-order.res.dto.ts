import { Exclude, Expose } from 'class-transformer';

import {
  FulfillmentType,
  OutboundOrderStatus,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ClientRefResDto } from '../../clients/dto/client-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class OutboundOrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu giao hàng' })
  code!: string;

  @Expose()
  @ClassField(() => ClientRefResDto)
  client!: ClientRefResDto;

  @Expose()
  @DateField({ description: 'Ngày giao' })
  fulfillmentDate!: Date;

  @Expose()
  @EnumField(() => FulfillmentType)
  fulfillmentType!: FulfillmentType;

  @Expose()
  @EnumField(() => OutboundOrderStatus)
  status!: OutboundOrderStatus;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Địa chỉ giao hàng' })
  deliveryAddress!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Người nhận' })
  receiverName!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Điện thoại người nhận' })
  receiverPhone!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Phương tiện' })
  vehicle!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  senderBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  sentAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  approverBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  approvedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  rejecterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  rejectedAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Lý do từ chối' })
  rejectionReason!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
