import {
  BooleanFieldOptional,
  ClassField,
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class RoutingStepReqDto {
  @UUIDField()
  operationId!: string;

  @NumberField({ int: true, min: 1 })
  stepNo!: number;

  @BooleanFieldOptional()
  isOutsideProcess?: boolean;

  @UUIDFieldOptional({ nullable: true })
  defaultSupplierId?: string | null;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}

export class UpdateRoutingReqDto {
  @ClassField(() => RoutingStepReqDto, { each: true })
  steps!: RoutingStepReqDto[];
}
