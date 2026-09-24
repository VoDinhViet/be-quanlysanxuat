import { Exclude, Expose } from 'class-transformer';

import { ProductionJobStatus } from '../../../database/schemas';
import { ClientBaseResDto } from '../../clients/dto/client-base.res.dto';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobResDto {
  @Expose()
  @UUIDField({ description: 'Job id — dùng cho GET /production-jobs/:jobId' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã Job' })
  code!: string;

  @Expose()
  @StringField({ description: 'Mã đơn hàng (SO)' })
  orderCode!: string;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Số PO của khách hàng trên đơn hàng gốc',
  })
  buyerPoNo!: string | null;

  @Expose()
  @ClassFieldOptional(() => ClientBaseResDto, { nullable: true })
  client!: ClientBaseResDto | null;

  @Expose()
  @FileField('imageFile', 'Ảnh sản phẩm')
  image!: FileResDto | null;

  @Expose()
  @NumberField({
    description: 'Qty (PO) — SL cần sản xuất, đã gộp theo sản phẩm',
  })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày đặt hàng' })
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @EnumField(() => ProductionJobStatus, { description: 'Trạng thái Job' })
  status!: ProductionJobStatus;
}
