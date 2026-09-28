import {
  ClassField,
  DateField,
  UUIDField,
} from '../../../decorators/field.decorators';

export class UpdateProductionJobOperationPlanItemReqDto {
  @UUIDField({ description: 'ID công đoạn trong Job' })
  readonly id!: string;

  @DateField({ description: 'Hạn cần hoàn thành công đoạn' })
  readonly dueDate!: Date;
}

export class UpdateProductionJobOperationsPlanReqDto {
  @ClassField(() => UpdateProductionJobOperationPlanItemReqDto, {
    each: true,
    description: 'Danh sách hạn hoàn thành các công đoạn trong Job',
  })
  readonly operations!: UpdateProductionJobOperationPlanItemReqDto[];
}
