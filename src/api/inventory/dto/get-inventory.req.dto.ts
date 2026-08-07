import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetInventoryReqDto extends PageOptionsDto {
  @UUIDFieldOptional({
    description: 'Chỉ tính tồn ở kho này — bỏ trống thì gộp mọi kho',
  })
  readonly warehouseId?: string;
}
