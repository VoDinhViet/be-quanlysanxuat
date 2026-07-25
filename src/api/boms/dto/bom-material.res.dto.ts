import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { BomItemUnitResDto } from './bom-item-unit.res.dto';

/**
 * One row of a BOM's material list, aggregated across every `itemType = MATERIAL` node in the
 * tree (any depth) that links to this material — one row per distinct material, not per node.
 * `totalQuantity` is a raw sum of each node's own `quantity`, NOT a BOM explosion (no
 * multiplication through a parent WIP's own quantity) — see `docs/features/boms.md`.
 */
@Exclude()
export class BomMaterialResDto {
  @Expose()
  @UUIDField()
  materialId!: string;

  @Expose()
  @StringField({ description: 'Mã vật tư' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư' })
  name!: string;

  @Expose()
  @ClassField(() => BomItemUnitResDto)
  unit!: BomItemUnitResDto;

  @Expose()
  @ClassFieldOptional(() => FileResDto, { nullable: true })
  image!: FileResDto | null;

  @Expose()
  @NumberField({
    description:
      'Tổng SL cộng dồn thô của vật tư này trong BOM (mọi cấp) — không nổ theo cấp',
  })
  totalQuantity!: number;
}
