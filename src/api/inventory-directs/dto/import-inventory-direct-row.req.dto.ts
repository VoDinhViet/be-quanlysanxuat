import {
  NumberField,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/** Mã và số lượng giữ dạng chuỗi thô để ô sai được báo lỗi theo dòng ở service. Ô trống phải bỏ
 * hẳn key: field tuỳ chọn vẫn từ chối chuỗi rỗng ở `ValidationPipe`. */
export class ImportInventoryDirectRowReqDto {
  @NumberField({
    int: true,
    isPositive: true,
    description: 'Số dòng trong file Excel',
  })
  readonly rowNumber!: number;

  @StringFieldOptional({ maxLength: 255, description: 'Mã vật tư' })
  readonly itemCode?: string;

  @StringFieldOptional({
    maxLength: 255,
    description: 'Phiên bản — bỏ trống khi mã chỉ có một bản',
  })
  readonly revision?: string;

  @StringField({
    maxLength: 50,
    description: 'Tồn thực tế (chuỗi số, tối đa 3 số lẻ)',
  })
  readonly actualQuantity!: string;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
