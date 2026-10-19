import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import {
  Permissions,
  PermissionsByParam,
} from '../../decorators/permissions.decorator';
import { ApiPublic } from '../../decorators/http.decorators';
import {
  IntegrationResultResDto,
  LimitReqDto,
} from './dto/integration-common.dto';
import {
  InventoryRankingReqDto,
  PaymentRequestValueReqDto,
  PurchasingSummaryReqDto,
  PurchasingSummaryEntity,
  PurchasingWatchKind,
  PurchasingWatchlistReqDto,
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

  @Get('purchasing-summary')
  @PermissionsByParam('entity', {
    [PurchasingSummaryEntity.PURCHASE_ORDERS]: 'purchasing:read',
    [PurchasingSummaryEntity.PAYMENT_REQUESTS]: 'purchasing:read',
    [PurchasingSummaryEntity.QUOTATIONS]: 'purchasing:read',
    [PurchasingSummaryEntity.SUPPLIER_RETURNS]: 'inventory:read',
  })
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Giá trị đơn mua theo nhà cung cấp, đề nghị thanh toán, báo giá hoặc phiếu trả nhà cung cấp theo trạng thái',
  })
  summarizePurchasing(
    @Query() reqDto: PurchasingSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.summarizePurchasing(reqDto);
  }

  @Get('purchasing-watchlist')
  @PermissionsByParam('kind', {
    [PurchasingWatchKind.OVERDUE_PURCHASE_ORDERS]: [
      'purchasing:read',
      'inventory:read',
    ],
    [PurchasingWatchKind.STUCK_REQUESTS]: 'purchase-requests:read',
    [PurchasingWatchKind.OVERDUE_PAYMENTS]: 'purchasing:read',
  })
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Đơn mua quá hạn nhận, đề nghị mua kẹt chưa lên đơn hoặc đề nghị thanh toán quá hạn',
  })
  listPurchasingWatchlist(
    @Query() reqDto: PurchasingWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.purchasingService.listPurchasingWatchlist(reqDto);
  }
}
