import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { GetProductionOrderLogsReqDto } from './dto/get-production-order-logs.req.dto';
import { GetProductionOrdersReqDto } from './dto/get-production-orders.req.dto';
import { ProductionOrderDetailResDto } from './dto/production-order-detail.res.dto';
import { ProductionOrderLogResDto } from './dto/production-order-log.res.dto';
import { ProductionOrderResDto } from './dto/production-order.res.dto';
import { UpdateProductionOrderReqDto } from './dto/update-production-order.req.dto';
import { ProductionOrdersService } from './production-orders.service';

@ApiTags('Production Orders')
@Controller('production-orders')
export class ProductionOrdersController {
  constructor(
    private readonly productionOrdersService: ProductionOrdersService,
  ) {}

  @Get()
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionOrderResDto,
    summary: 'List LSX main screen rows — one per approved order',
    isPaginated: true,
  })
  getProductionOrders(
    @Query() reqDto: GetProductionOrdersReqDto,
  ): Promise<OffsetPaginatedDto<ProductionOrderResDto>> {
    return this.productionOrdersService.getProductionOrders(reqDto);
  }

  @Get(':productionOrdersId')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionOrderDetailResDto,
    summary: 'Get production order detail — snapshot ghi lúc duyệt PO',
  })
  getProductionOrdersById(
    @UUIDParam('productionOrdersId') productionOrdersId: string,
  ): Promise<ProductionOrderDetailResDto> {
    return this.productionOrdersService.getProductionOrdersById(
      productionOrdersId,
    );
  }

  @Patch(':productionOrdersId')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionOrderDetailResDto,
    summary:
      'Update production quantity per line (manual input) — only while LSX is PENDING',
  })
  updateProductionOrder(
    @UUIDParam('productionOrdersId') productionOrdersId: string,
    @Body() reqDto: UpdateProductionOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionOrderDetailResDto> {
    return this.productionOrdersService.updateProductionOrder(
      productionOrdersId,
      reqDto,
      payload.userId,
    );
  }

  @Get(':productionOrdersId/logs')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionOrderLogResDto,
    summary: 'Get LSX action log — thời gian, người thực hiện, nội dung',
    isPaginated: true,
  })
  getProductionOrderLogs(
    @UUIDParam('productionOrdersId') productionOrdersId: string,
    @Query() reqDto: GetProductionOrderLogsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionOrderLogResDto>> {
    return this.productionOrdersService.getProductionOrderLogs(
      productionOrdersId,
      reqDto,
    );
  }

  @Post(':productionOrdersId/approve')
  @Permissions('production:approve')
  @ApiAuth({
    type: ProductionOrderDetailResDto,
    summary: 'Approve LSX — PENDING → APPROVED, đẩy PO gốc sang IN_PROGRESS',
  })
  approveProductionOrder(
    @UUIDParam('productionOrdersId') productionOrdersId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionOrderDetailResDto> {
    return this.productionOrdersService.approveProductionOrder(
      productionOrdersId,
      payload.userId,
    );
  }
}
