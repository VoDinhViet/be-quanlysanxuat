import { StringFieldOptional } from '../../../decorators/field.decorators';

/** Không phân trang — luôn trả cả danh sách cho dropdown, giới hạn `ClientsService.OPTIONS_LIMIT`
 * (100) vì `clients` là dữ liệu bulk-seed/import, không nhỏ như các catalogue khác. */
export class GetClientOptionsReqDto {
  @StringFieldOptional({
    description: 'Search on code or name (accent-insensitive)',
  })
  readonly q?: string;
}
