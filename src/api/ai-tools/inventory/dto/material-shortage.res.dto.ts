import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { InventoryDirectResDto } from '../../../inventory-directs/dto/inventory-direct.res.dto';

/** What the model sees for one material: the stock figures, not the id or image of the full DTO. */
@Exclude()
export class MaterialShortageResDto extends PickType(InventoryDirectResDto, [
  'code',
  'name',
  'unit',
  'supplier',
  'onHand',
  'reserved',
  'bomDemand',
  'available',
  'minStock',
] as const) {}
