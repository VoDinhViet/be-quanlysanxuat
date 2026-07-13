import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UserStatus } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetUsersReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => UserStatus)
  readonly status?: UserStatus;
}
