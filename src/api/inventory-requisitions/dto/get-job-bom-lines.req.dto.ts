import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDField } from '../../../decorators/field.decorators';

export class GetJobBomLinesReqDto extends PageOptionsDto {
  @UUIDField({ description: 'Job cần lãnh vật tư' })
  readonly productionJobId!: string;

  @UUIDField({
    description: 'Kho lãnh — dùng tính Tồn thực tế/Đã giữ theo đúng kho',
  })
  readonly warehouseId!: string;
}
