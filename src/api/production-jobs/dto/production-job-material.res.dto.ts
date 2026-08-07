import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** Nguồn dữ liệu là chính `production_job_materials` — mọi field snapshot text (`materialCode`/
 * `materialName`/`unitCode`/`unitName`) đóng băng lúc duyệt LSX, độc lập `items`/`units` sống.
 * `itemId` chỉ còn là liên kết tham khảo, có thể null. Xem `docs/domains/production.md`. */
@Exclude()
export class ProductionJobMaterialResDto {
  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Liên kết tham khảo tới vật tư gốc',
  })
  itemId!: string | null;

  @Expose()
  @StringField({ description: 'Mã vật tư — snapshot lúc duyệt LSX' })
  materialCode!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư — snapshot lúc duyệt LSX' })
  materialName!: string;

  @Expose()
  @StringField({ description: 'Mã đơn vị tính — snapshot lúc duyệt LSX' })
  unitCode!: string;

  @Expose()
  @StringField({ description: 'Tên đơn vị tính — snapshot lúc duyệt LSX' })
  unitName!: string;

  @Expose()
  @ClassFieldOptional(() => FileResDto, { nullable: true })
  image!: FileResDto | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'Định mức BOM lúc duyệt LSX, bất biến',
  })
  unitQty!: number | null;

  @Expose()
  @NumberField({ description: 'Nhu cầu thật của Job = định mức × SL Job' })
  requiredQty!: number;
}
