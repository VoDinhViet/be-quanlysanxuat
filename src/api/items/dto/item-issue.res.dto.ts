import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

/** Một dòng vật tư (RM) as-used trong cây BOM của một FG/WIP — 1 dòng/vật tư, gộp mọi vị trí xuất
 * hiện trong cây (cùng vật tư có thể nằm dưới nhiều node cha khác nhau). Nguồn là `bom_items`,
 * không phải bảng riêng. */
@Exclude()
export class ItemIssueResDto {
  @Expose()
  @UUIDField({ description: 'Id của vật tư' })
  itemId!: string;

  @Expose()
  @StringField({ description: 'Mã vật tư' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư' })
  name!: string;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @ClassFieldOptional(() => FileResDto, { nullable: true })
  image!: FileResDto | null;

  @Expose()
  @NumberField({
    description:
      'Định mức nổ cấp cho 1 đơn vị thành phẩm/bán thành phẩm gốc — nhân luỹ kế qua toàn bộ ' +
      'chuỗi node cha, gộp mọi vị trí xuất hiện trong cây. Cùng tên với ' +
      '`ProductionJobIssueResDto.requiredQty` — cùng khái niệm nổ cấp, khác seed (1 đơn vị gốc ' +
      'so với SL Job)',
  })
  requiredQty!: number;
}
