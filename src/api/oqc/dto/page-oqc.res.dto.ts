import { Exclude, Expose } from 'class-transformer';

import {
  IqcResult,
  OqcDisposition,
  QualityInspectionStatus,
} from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductionJobOperationRefResDto } from '../../production-jobs/dto/production-job-operation-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { OqcBomItemResDto } from './oqc.res.dto';

@Exclude()
export class PageOqcResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã OQC' })
  code!: string;

  @Expose()
  @ClassField(() => ProductionJobRefResDto)
  productionJob!: ProductionJobRefResDto;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã đơn hàng (SO)' })
  orderCode!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Số PO của khách hàng (orders.buyerPoNo)',
  })
  buyerPoNo!: string | null;

  @Expose()
  @ClassField(() => ProductionJobOperationRefResDto)
  operation!: ProductionJobOperationRefResDto;

  @Expose()
  @ClassField(() => OqcBomItemResDto)
  bomItem!: OqcBomItemResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @FileField('imageFile', 'Ảnh sản phẩm / chi tiết')
  image!: FileResDto | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Phiên bản sản phẩm (revision)',
  })
  revision?: string;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @NumberField({ description: 'Lot size (SL sản xuất thực tế)' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày kiểm' })
  inspectionDate!: Date;

  @Expose()
  @EnumFieldOptional(() => IqcResult, { nullable: true })
  result!: IqcResult | null;

  @Expose()
  @EnumField(() => QualityInspectionStatus)
  status!: QualityInspectionStatus;

  @Expose()
  @EnumFieldOptional(() => OqcDisposition, {
    nullable: true,
    description: 'Cách xử lý khi FAIL',
  })
  disposition!: OqcDisposition | null;
}
