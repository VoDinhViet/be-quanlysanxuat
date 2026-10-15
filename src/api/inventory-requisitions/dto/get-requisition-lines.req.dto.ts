import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  BooleanFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** `q` kế thừa từ `PageOptionsDto`, lọc được cả khi có lẫn không có `productionJobId`. */
export class GetRequisitionLinesReqDto extends PageOptionsDto {
  @UUIDFieldOptional({
    description:
      'Job cần lãnh vật tư — có thì khoanh vùng theo định mức BOM của Job',
  })
  readonly productionJobId?: string;

  @BooleanFieldOptional({
    description:
      'Chỉ lấy các vật tư chưa lãnh đủ định mức BOM của Job (requiredQty > issuedQuantity)',
  })
  readonly hasRemainingBom?: boolean;
}
