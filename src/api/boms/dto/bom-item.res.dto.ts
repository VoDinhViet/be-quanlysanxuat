import { Exclude, Expose } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { RoutingStepResDto } from '../../routing/dto/routing-step.res.dto';
import { BomItemNodeResDto } from './bom-item-node.res.dto';

@Exclude()
export class BomItemResDto extends BomItemNodeResDto {
  @Expose()
  @ClassFieldOptional(() => RoutingStepResDto, { each: true })
  operations!: RoutingStepResDto[];
}
