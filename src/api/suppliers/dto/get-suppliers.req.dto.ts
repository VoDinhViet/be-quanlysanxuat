import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { SupplierStatus } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetSuppliersReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => SupplierStatus)
  readonly status?: SupplierStatus;

  @UUIDFieldOptional({ description: 'Filter by supplier group id' })
  readonly supplierGroupId?: string;

  @UUIDFieldOptional({ description: 'Filter by country id' })
  readonly countryId?: string;
}
