import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { BooleanFieldOptional } from '../../../decorators/field.decorators';

export class GetDepartmentsReqDto extends PageOptionsDto {
  @BooleanFieldOptional({ description: 'Filter by active status' })
  isActive?: boolean;
}
