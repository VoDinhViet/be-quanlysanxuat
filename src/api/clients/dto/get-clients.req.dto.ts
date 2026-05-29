import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ClientType } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetClientsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => ClientType)
  readonly clientType?: ClientType;
}
