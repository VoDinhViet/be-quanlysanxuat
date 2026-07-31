import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  NumberField,
} from '../../../decorators/field.decorators';
import { RoutingStepResDto } from '../../routing/dto/routing-step.res.dto';
import { BomItemNodeResDto } from './bom-item-node.res.dto';

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
