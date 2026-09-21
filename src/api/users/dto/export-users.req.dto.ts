import { StringFieldOptional } from '../../../decorators/field.decorators';

export class ExportUsersReqDto {
  @StringFieldOptional({ description: 'Tìm theo mã nhân viên hoặc họ tên' })
  readonly q?: string;
}
