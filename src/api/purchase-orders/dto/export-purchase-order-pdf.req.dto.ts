import { NumberFieldOptional } from '../../../decorators/field.decorators';

export class ExportPurchaseOrderPdfReqDto {
  @NumberFieldOptional({
    min: 0,
    max: 100,
    description:
      'Thuế GTGT (%) áp cho toàn bộ PO khi xuất PDF — không lưu DB, bỏ trống = 0%',
  })
  vatPercent?: number;
}
