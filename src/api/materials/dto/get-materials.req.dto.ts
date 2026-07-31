import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { MaterialStatus, MaterialType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetMaterialsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => MaterialType)
  readonly type?: MaterialType;

  @UUIDFieldOptional({ description: 'Filter by material group id' })
  readonly materialGroupId?: string;

  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @EnumFieldOptional(() => MaterialStatus)
  readonly status?: MaterialStatus;

  @UUIDFieldOptional({ description: 'Filter by supplier id' })
  readonly supplierId?: string;
}
