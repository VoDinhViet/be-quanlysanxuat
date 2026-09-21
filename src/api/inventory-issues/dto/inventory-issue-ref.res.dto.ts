import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { InventoryIssueResDto } from './inventory-issue.res.dto';

@Exclude()
export class InventoryIssueRefResDto extends PickType(InventoryIssueResDto, [
  'id',
  'code',
  'issueType',
] as const) {}
