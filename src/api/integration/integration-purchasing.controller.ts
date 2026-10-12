import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { Permissions } from '../../decorators/permissions.decorator';
import { ApiPublic } from '../../decorators/http.decorators';
import {
  IntegrationResultResDto,
  LimitReqDto,
} from './dto/integration-common.dto';
import {
  InventoryRankingReqDto,
  PaymentRequestValueReqDto,
  PurchaseValueBySupplierReqDto,
} from './dto/integration-purchasing.req.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOnBehalfGuard } from './guards/integration-on-behalf.guard';
import { IntegrationPurchasingService } from './integration-purchasing.service';

@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, IntegrationOnBehalfGuard, ThrottlerGuard)
@Controller({ path: 'integration', version: '1' })
export class IntegrationPurchasingController {
  constructor(
    private readonly purchasingService: IntegrationPurchasingService,
  ) {}

  @Get('inventory-ranking')
  @Permissions('inventory:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Vật tư xếp theo tồn kho (cao nhất, thấp nhất hoặc dưới mức tồn tối thiểu)',
  })
  inventoryRanking(
    @Query() reqDto: InventoryRankingReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.inventoryRanking(reqDto);
  }

  @Get('purchase-value-by-supplier')
  @Permissions('purchasing:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Giá trị đơn mua theo nhà cung cấp',
  })
  purchaseValueBySupplier(
    @Query() reqDto: PurchaseValueBySupplierReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.purchaseValueBySupplier(reqDto);
  }

  @Get('overdue-purchase-orders')
  @Permissions('purchasing:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Đơn mua đã đặt, quá ngày dự kiến và chưa nhận đủ hàng',
  })
  overduePurchaseOrders(
    @Query() reqDto: LimitReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.overduePurchaseOrders(reqDto);
  }

  @Get('stuck-purchase-requests')
  @Permissions('purchase-requests:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Đề nghị mua đã duyệt nhưng còn dòng chưa lên đơn mua',
  })
  stuckPurchaseRequests(
    @Query() reqDto: LimitReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.stuckPurchaseRequests(reqDto);
  }

  @Get('overdue-payment-requests')
  @Permissions('purchasing:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary: 'Đề nghị thanh toán đang chờ và đã quá hạn',
  })
  overduePaymentRequests(
    @Query() reqDto: LimitReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.overduePaymentRequests(reqDto);
  }

  @Get('payment-request-value')
  @Permissions('purchasing:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Số lượng và tổng giá trị đề nghị thanh toán (một trạng thái hoặc theo trạng thái)',
  })
  paymentRequestValue(
    @Query() reqDto: PaymentRequestValueReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.paymentRequestValue(reqDto);
  }
}
