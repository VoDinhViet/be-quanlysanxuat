import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** Popup chọn vật tư dùng chung "Lãnh từ LSX"/"Lãnh thủ công" (`GET .../lines`) — `q` kế thừa từ
 * `PageOptionsDto`, lọc được ở cả hai luồng. */
export class GetRequisitionLinesReqDto extends PageOptionsDto {
  @UUIDField({
    description: 'Kho lãnh — dùng tính Tồn thực tế/Đã giữ theo đúng kho',
  })
  readonly warehouseId!: string;

  @UUIDFieldOptional({
    description:
      'Job cần lãnh vật tư — có thì khoanh vùng theo định mức BOM của Job',
  })
  readonly productionJobId?: string;
}
