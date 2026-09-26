import { Exclude, Expose } from 'class-transformer';

import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ProductionJobDetailResDto } from '../../production-jobs/dto/production-job-detail.res.dto';

/** Header của màn "Thực hiện sản xuất" cho một Job: chi tiết Job + ảnh sản phẩm tổng, để màn này
 * không phải gọi thêm `GET /items/:id` (cần `items:read`). */
@Exclude()
export class ProductionExecutionJobDetailResDto extends ProductionJobDetailResDto {
  @Expose()
  @FileField('imageFile', 'Ảnh sản phẩm')
  image!: FileResDto | null;
}
