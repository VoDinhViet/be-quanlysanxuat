import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ClientStatus } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetClientsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => ClientStatus)
  readonly status?: ClientStatus;

  @UUIDFieldOptional({ description: 'Filter by client group id' })
  readonly clientGroupId?: string;
}
