import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { Permissions } from '../../decorators/permissions.decorator';
import { ApiPublic } from '../../decorators/http.decorators';
import { IntegrationResultResDto } from './dto/integration-common.dto';
import { InventorySummaryReqDto } from './dto/integration-inventory.req.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOnBehalfGuard } from './guards/integration-on-behalf.guard';
import { IntegrationInventoryService } from './integration-inventory.service';

@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, IntegrationOnBehalfGuard, ThrottlerGuard)
@Controller({ path: 'integration', version: '1' })
export class IntegrationInventoryController {
  constructor(private readonly inventoryService: IntegrationInventoryService) {}

  @Get('inventory-summary')
  @Permissions('inventory:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Vật tư xếp theo tồn kho, vật tư dưới mức tồn tối thiểu hoặc số phiếu nhập theo loại và trạng thái',
  })
  summarizeInventory(
    @Query() reqDto: InventorySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.inventoryService.summarizeInventory(reqDto);
  }
}
