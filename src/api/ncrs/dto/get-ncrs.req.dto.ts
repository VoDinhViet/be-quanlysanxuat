import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { NcrStatus, NcrType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetNcrsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => NcrStatus)
  readonly status?: NcrStatus;

  @EnumFieldOptional(() => NcrType)
  readonly type?: NcrType;

  @UUIDFieldOptional({ description: 'Filter theo bộ phận phát sinh' })
  readonly departmentId?: string;

  @UUIDFieldOptional({ description: 'Filter theo khách hàng' })
  readonly clientId?: string;
}
