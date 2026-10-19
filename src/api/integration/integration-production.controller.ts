import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import {
  Permissions,
  PermissionsByParam,
} from '../../decorators/permissions.decorator';
import { ApiPublic } from '../../decorators/http.decorators';
import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  LateJobOperationsReqDto,
  OperationsByTypeReqDto,
  ProductionJobsByItemReqDto,
  ProductionSummaryEntity,
  ProductionSummaryReqDto,
  ProductionWatchKind,
  ProductionWatchlistReqDto,
} from './dto/integration-production.req.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOnBehalfGuard } from './guards/integration-on-behalf.guard';
import { IntegrationProductionService } from './integration-production.service';

@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, IntegrationOnBehalfGuard, ThrottlerGuard)
@Controller({ path: 'integration', version: '1' })
export class IntegrationProductionController {
  constructor(
    private readonly productionService: IntegrationProductionService,
  ) {}

  @Get('open-production-orders')
  @Permissions('production:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Lệnh sản xuất chưa hoàn thành, kèm mã đơn bán',
  })
  openProductionOrders(): Promise<IntegrationResultResDto> {
    return this.productionService.openProductionOrders();
  }

  @Get('production-jobs-by-item')
  @Permissions('production:read')
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
  @Permissions('production:read')
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
  @Permissions('operations:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Số công đoạn sản xuất theo loại (OUTSOURCE là gia công ngoài)',
  })
  operationsByType(
    @Query() reqDto: OperationsByTypeReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.productionService.operationsByType(reqDto);
  }

  @Get('production-summary')
  @PermissionsByParam('entity', {
    [ProductionSummaryEntity.JOBS]: 'production:read',
    [ProductionSummaryEntity.PRODUCTION_ORDERS]: 'production:read',
    [ProductionSummaryEntity.OPERATIONS]: 'operations:read',
    [ProductionSummaryEntity.OUTSOURCING_ORDERS]: 'outsourcing:read',
  })
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Số job, lệnh sản xuất, công đoạn hoặc phiếu gia công ngoài gom theo trạng thái, mã hàng, loại hoặc nhà cung cấp',
  })
  summarizeProduction(
    @Query() reqDto: ProductionSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.productionService.summarizeProduction(reqDto);
  }

  @Get('production-watchlist')
  @PermissionsByParam('kind', {
    [ProductionWatchKind.LATE_OPERATIONS]: 'production:read',
    [ProductionWatchKind.OPEN_PRODUCTION_ORDERS]: 'production:read',
    [ProductionWatchKind.OVERDUE_OUTSOURCING]: 'outsourcing:read',
  })
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Công đoạn quá hạn chưa xong, lệnh sản xuất chưa hoàn thành hoặc phiếu gia công ngoài quá hạn nhận về',
  })
  listProductionWatchlist(
    @Query() reqDto: ProductionWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.productionService.listProductionWatchlist(reqDto);
  }
}
