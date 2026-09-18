import { DateField } from '../../../decorators/field.decorators';

export class UpdateProductionJobOperationDueDateReqDto {
  @DateField({ description: 'Hạn cần hoàn thành công đoạn' })
  readonly dueDate!: Date;
}
