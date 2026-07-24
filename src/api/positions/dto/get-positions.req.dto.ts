import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetPositionsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter by department id' })
  readonly departmentId?: string;
}
