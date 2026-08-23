import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDField } from '../../../decorators/field.decorators';

export class GetIssuableItemsReqDto extends PageOptionsDto {
  @UUIDField({ description: 'Kho lãnh' })
  readonly warehouseId!: string;
}
