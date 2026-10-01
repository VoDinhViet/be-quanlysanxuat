import { Exclude, Expose } from 'class-transformer';

import {
  DateFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobPlanOperationResDto {
  @Expose()
  @StringField({ description: 'Key định danh nhóm công đoạn' })
  key!: string;

  @Expose()
  @StringField({ description: 'Mã công đoạn' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn' })
  name!: string;

  @Expose()
  @StringField({
    each: true,
    description: 'Danh sách mã chi tiết (BOM items) áp dụng công đoạn này',
  })
  bomItemCodes!: string[];

  @Expose()
  @UUIDField({
    each: true,
    description: 'Danh sách ID công đoạn trong Job',
  })
  operationIds!: string[];

  @Expose()
  @NumberField({ int: true, description: 'Thứ tự ưu tiên sắp xếp công đoạn' })
  sortOrder!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Cấp BOM sâu nhất của chi tiết có công đoạn này (0 = thành phẩm) — công đoạn cấp sâu hơn phải xong trước',
  })
  level!: number;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description: 'Hạn hoàn thành công đoạn nếu đã có',
  })
  dueDate?: Date | null;
}
