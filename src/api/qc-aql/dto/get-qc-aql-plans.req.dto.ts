import { IqcInspectionLevel } from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  BooleanFieldOptional,
  EnumFieldOptional,
} from '../../../decorators/field.decorators';

export class GetQcAqlPlansReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => IqcInspectionLevel)
  readonly inspectionLevel?: IqcInspectionLevel;

  @BooleanFieldOptional({
    description: 'Lọc theo còn dùng để tra AQL hay không',
  })
  readonly isActive?: boolean;
}
