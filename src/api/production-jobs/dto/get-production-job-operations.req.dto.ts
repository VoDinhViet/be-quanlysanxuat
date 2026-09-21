import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetProductionJobOperationsReqDto {
  @UUIDFieldOptional({
    description:
      'Chỉ trả BOM item nào chứa đúng công đoạn này (dùng bởi "Thực hiện sản xuất")',
  })
  readonly operationId?: string;
}
