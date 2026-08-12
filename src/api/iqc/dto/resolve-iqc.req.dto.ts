import { IqcDisposition } from '../../../database/schemas';
import { EnumField } from '../../../decorators/field.decorators';

export class ResolveIqcReqDto {
  @EnumField(() => IqcDisposition, {
    description:
      'Phương án xử lý — CONCESSION (chấp nhận đặc biệt, hoàn thành ngay) / SORT (phân loại) / RETURN (trả NCC), cả 2 sau đều chuyển Chờ trả NCC',
  })
  readonly disposition!: IqcDisposition;
}
