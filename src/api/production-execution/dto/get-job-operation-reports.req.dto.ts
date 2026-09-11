import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetJobOperationReportsReqDto {
  @UUIDFieldOptional({
    description: 'Lọc theo ID danh mục công đoạn (operationId)',
  })
  readonly operationId?: string;

  @UUIDFieldOptional({
    description: 'Lọc theo ID công đoạn của Job (jobOperationId)',
  })
  readonly jobOperationId?: string;
}
