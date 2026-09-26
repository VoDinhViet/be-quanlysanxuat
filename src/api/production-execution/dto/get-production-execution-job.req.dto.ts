import { UUIDField } from '../../../decorators/field.decorators';

export class GetProductionExecutionJobReqDto {
  @UUIDField({
    description:
      'Công đoạn đang làm việc (operations.id) — bắt buộc, phải nằm trong phạm vi được phân công',
  })
  readonly operationId!: string;
}
