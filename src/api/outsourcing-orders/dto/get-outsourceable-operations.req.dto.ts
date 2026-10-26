import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetOutsourceableOperationsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo Job (LSX)' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Filter theo công đoạn (danh mục sống)' })
  readonly operationId?: string;

  @UUIDFieldOptional({
    description:
      'Phiếu OS-OUT đang sửa: SL của chính phiếu này không bị trừ khỏi số còn được gửi',
  })
  readonly excludeOutsourcingOrderId?: string;
}
