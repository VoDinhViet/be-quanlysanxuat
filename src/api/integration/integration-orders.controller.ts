import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ApiPublic } from '../../decorators/http.decorators';
import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  CountByStatusReqDto,
  CountClientsReqDto,
  OrderProgressReqDto,
  OrderValueReqDto,
  OverdueOrdersReqDto,
  PendingDeliveriesReqDto,
  TopClientsReqDto,
} from './dto/integration-orders.req.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOrdersService } from './integration-orders.service';

// `ApiPublic` chỉ để bỏ qua JWT toàn cục; quyền vào route do `IntegrationApiKeyGuard` quyết định
@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, ThrottlerGuard)
@Controller({ path: 'integration', version: '1' })
export class IntegrationOrdersController {
  constructor(private readonly ordersService: IntegrationOrdersService) {}

  @Get('count-by-status')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Số bản ghi theo trạng thái của một thực thể (đơn, job, lệnh, đề nghị thanh toán, phiếu nhập)',
  })
  countByStatus(
    @Query() reqDto: CountByStatusReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.ordersService.countByStatus(reqDto);
  }

  @Get('order-value-over-time')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Giá trị hoặc số lượng đơn bán theo tháng, khách hàng hoặc trạng thái',
  })
  orderValueOverTime(
    @Query() reqDto: OrderValueReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.ordersService.orderValueOverTime(reqDto);
  }

  @Get('top-clients-by-order-value')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Khách hàng có tổng giá trị đơn lớn nhất',
  })
  topClientsByOrderValue(
    @Query() reqDto: TopClientsReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.ordersService.topClientsByOrderValue(reqDto);
  }

  @Get('overdue-orders')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Đơn bán quá hạn giao (hoặc đến hạn trong N ngày tới)',
  })
  overdueOrders(
    @Query() reqDto: OverdueOrdersReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.ordersService.overdueOrders(reqDto);
  }

  @Get('pending-deliveries')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Phiếu xuất đang chờ giao, đến hạn trong N ngày (kể cả đã quá hạn)',
  })
  pendingDeliveries(
    @Query() reqDto: PendingDeliveriesReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.ordersService.pendingDeliveries(reqDto);
  }

  @Get('order-progress')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Tiến độ sản xuất theo đơn bán: số job xong trên tổng số job',
  })
  orderProgress(
    @Query() reqDto: OrderProgressReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.ordersService.orderProgress(reqDto);
  }

  @Get('count-clients')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Số khách hàng (theo một trạng thái hoặc gộp theo trạng thái)',
  })
  countClients(
    @Query() reqDto: CountClientsReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.ordersService.countClients(reqDto);
  }
}
