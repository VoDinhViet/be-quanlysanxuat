import { Exclude, Expose } from 'class-transformer';

import {
  NcrCostKind,
  NcrLogAction,
  ProductionOrderNcrAction,
  ProductionOrderStatus,
} from '../../../database/schemas';
import {
  BooleanField,
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { ItemImageRefResDto } from '../../items/dto/item-image-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { NcrResDto } from './ncr.res.dto';
import { NcrOqcRefResDto, NcrRefResDto } from './ncr-trace.res.dto';

@Exclude()
export class NcrCostLineResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EnumField(() => NcrCostKind)
  kind!: NcrCostKind;

  @Expose()
  @StringField()
  description!: string;

  @Expose()
  @UUIDFieldOptional({ nullable: true })
  itemId!: string | null;

  @Expose()
  @NumberField()
  quantity!: number;

  @Expose()
  @NumberField()
  unitPrice!: number;

  @Expose()
  @NumberField()
  amount!: number;

  @Expose()
  @BooleanField()
  isSuggested!: boolean;
}

@Exclude()
export class NcrProductionOrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @EnumField(() => ProductionOrderNcrAction)
  ncrAction!: ProductionOrderNcrAction;

  @Expose()
  @EnumField(() => ProductionOrderStatus)
  status!: ProductionOrderStatus;
}

@Exclude()
export class NcrLogResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EnumField(() => NcrLogAction)
  action!: NcrLogAction;

  @Expose()
  @StringField()
  content!: string;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  performerBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}

@Exclude()
export class NcrDetailResDto extends NcrResDto {
  @Expose()
  @ClassField(() => ItemImageRefResDto)
  declare item: ItemImageRefResDto;

  @Expose()
  @UUIDField({ each: true })
  reworkOperationIds!: string[];

  @Expose()
  @ClassField(() => NcrCostLineResDto, { each: true })
  costLines!: NcrCostLineResDto[];

  @Expose()
  @NumberField({ description: 'Tổng dự toán chi phí' })
  totalCost!: number;

  @Expose()
  @ClassField(() => NcrProductionOrderResDto, { each: true })
  productionOrders!: NcrProductionOrderResDto[];

  @Expose()
  @ClassField(() => NcrLogResDto, { each: true })
  logs!: NcrLogResDto[];

  @Expose()
  @ClassFieldOptional(() => NcrOqcRefResDto, {
    nullable: true,
    description: 'Phiếu OQC sàng lọc sinh ra NCR này (null = NCR thủ công)',
  })
  qualityInspection!: NcrOqcRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => NcrRefResDto, {
    nullable: true,
    description:
      'NCR cha — NCR này sinh từ phiếu OQC lại của NCR cha (null = NCR gốc)',
  })
  parentNcr!: NcrRefResDto | null;

  @Expose()
  @ClassField(() => NcrRefResDto, { each: true })
  childNcrs!: NcrRefResDto[];

  @Expose()
  @ClassField(() => NcrOqcRefResDto, {
    each: true,
    description: 'Các phiếu OQC lại được yêu cầu từ NCR này',
  })
  reinspections!: NcrOqcRefResDto[];
}
