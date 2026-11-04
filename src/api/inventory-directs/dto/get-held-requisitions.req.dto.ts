import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { InventoryRequisitionType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetHeldRequisitionsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo bộ phận lãnh' })
  readonly departmentId?: string;

  @EnumFieldOptional(() => InventoryRequisitionType, {
    description:
      'Filter theo loại phiếu: PRODUCTION (sản xuất) hoặc OTHER (khác)',
  })
  readonly type?: InventoryRequisitionType;
}
