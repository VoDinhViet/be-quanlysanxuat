import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetPendingOrderItemsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo công đoạn (danh mục sống)' })
  readonly operationId?: string;
}
