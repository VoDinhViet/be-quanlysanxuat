import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetProductionOrdersReqDto } from './dto/get-production-orders.req.dto';
import { ProductionOrderDetailResDto } from './dto/production-order-detail.res.dto';
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

  @Get(':orderId')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionOrderDetailResDto,
    summary: 'Get production order detail (Tab1 header + Tab2 lines)',
  })
  getProductionOrderDetail(
    @UUIDParam('orderId') orderId: string,
  ): Promise<ProductionOrderDetailResDto> {
    return this.productionOrdersService.getProductionOrderDetail(orderId);
  }

  @Patch(':orderId')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionOrderDetailResDto,
    summary: '"Lưu lại" — save the decided Đề xuất SX per line (replace-all)',
  })
  updateProductionOrder(
    @UUIDParam('orderId') orderId: string,
    @Body() reqDto: UpdateProductionOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionOrderDetailResDto> {
    return this.productionOrdersService.updateProductionOrder(
      orderId,
      reqDto,
      payload.sub,
    );
  }

  @Post(':orderId/issue')
  @Permissions('production:create')
  @ApiAuth({
    type: ProductionOrderDetailResDto,
    summary:
      '"Tạo LSX" — issue one Job per FG product, record stock delivery, move order to IN_PROGRESS',
  })
  issueProductionOrders(
    @UUIDParam('orderId') orderId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionOrderDetailResDto> {
    return this.productionOrdersService.issueProductionOrders(
      orderId,
      payload.sub,
    );
  }
}
