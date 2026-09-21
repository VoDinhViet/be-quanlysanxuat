import { Exclude, Expose } from 'class-transformer';

import {
  FulfillmentType,
  OutboundOrderStatus,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ClientRefResDto } from '../../clients/dto/client-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class PageOutboundOrderResDto {
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
  @StringField({
    each: true,
    description:
      'Mã đơn hàng nguồn (PO / Lý do) — 1 phiếu giao gộp được nhiều đơn, rỗng khi chưa có dòng nào',
  })
  orderCodes!: string[];

  @Expose()
  @NumberField({ description: 'Tổng SL giao (Σ SL mọi dòng của phiếu)' })
  totalQuantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
