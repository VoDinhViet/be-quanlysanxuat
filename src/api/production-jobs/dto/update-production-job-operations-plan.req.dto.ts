import {
  ClassField,
  DateField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateProductionJobOperationPlanItemReqDto {
  @UUIDFieldOptional({ description: 'ID công đoạn cụ thể trong Job' })
  readonly id?: string;

  @UUIDFieldOptional({
    each: true,
    description: 'Danh sách ID công đoạn cụ thể trong Job',
  })
  readonly operationIds?: string[];

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
