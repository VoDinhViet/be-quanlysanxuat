import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetJobOperationReportsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({
    description: 'Lọc theo ID danh mục công đoạn (operationId)',
  })
  readonly operationId?: string;

  @UUIDFieldOptional({
    description: 'Lọc theo ID công đoạn của Job (jobOperationId)',
  })
  readonly jobOperationId?: string;

  @UUIDFieldOptional({ description: 'Lọc theo Part (bomItemId)' })
  readonly bomItemId?: string;
}
