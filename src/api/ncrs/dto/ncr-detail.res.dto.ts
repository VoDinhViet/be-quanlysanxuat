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
}
