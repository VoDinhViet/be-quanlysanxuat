import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ApiPublic } from '../../decorators/http.decorators';
import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  LateJobOperationsReqDto,
  OperationsByTypeReqDto,
  ProductionJobsByItemReqDto,
} from './dto/integration-production.req.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationProductionService } from './integration-production.service';

@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, ThrottlerGuard)
@Controller({ path: 'integration', version: '1' })
export class IntegrationProductionController {
  constructor(
    private readonly productionService: IntegrationProductionService,
  ) {}

  @Get('open-production-orders')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Lệnh sản xuất chưa hoàn thành, kèm mã đơn bán',
  })
  openProductionOrders(): Promise<IntegrationResultResDto> {
    return this.productionService.openProductionOrders();
  }

  @Get('production-jobs-by-item')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Số job sản xuất theo mã hàng, lọc theo trạng thái',
  })
  productionJobsByItem(
    @Query() reqDto: ProductionJobsByItemReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.productionService.productionJobsByItem(reqDto);
  }

  @Get('late-job-operations')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Công đoạn quá hạn và chưa xong, kèm đơn và job (tuỳ chọn: lâu không báo cáo tiến độ)',
  })
  lateJobOperations(
    @Query() reqDto: LateJobOperationsReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.productionService.lateJobOperations(reqDto);
  }

  @Get('operations-by-type')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Số công đoạn sản xuất theo loại (OUTSOURCE là gia công ngoài)',
  })
  operationsByType(
    @Query() reqDto: OperationsByTypeReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.productionService.operationsByType(reqDto);
  }
}
