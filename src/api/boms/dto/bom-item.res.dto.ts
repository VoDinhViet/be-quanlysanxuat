import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  NumberField,
} from '../../../decorators/field.decorators';
import { RoutingStepResDto } from '../../routing/dto/routing-step.res.dto';
import { BomItemNodeResDto } from './bom-item-node.res.dto';

/**
 * One node of the BOM tree, nested — `children` holds this same node type, mirroring the tree-grid
 * this feeds. Extends `BomItemNodeResDto` (the fields intrinsic to a single node) with the fields
 * that only make sense in tree context: `level` (computed depth), `children`, and `operations`
 * (this node's own as-used routing, read-time embedded; always `[]` for an `itemType = MATERIAL`
 * node, since a vật tư leaf never carries its own routing).
 */
@Exclude()
export class BomItemResDto extends BomItemNodeResDto {
  @Expose()
  @NumberField({
    int: true,
    description: '1-based depth from the tree top, computed — not stored',
  })
  level!: number;

  @Expose()
  @ClassFieldOptional(() => BomItemResDto, { each: true })
  children!: BomItemResDto[];

  @Expose()
  @ClassFieldOptional(() => RoutingStepResDto, { each: true })
  operations!: RoutingStepResDto[];
}
