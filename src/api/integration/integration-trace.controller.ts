import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ApiPublic } from '../../decorators/http.decorators';
import {
  Permissions,
  PermissionsByParam,
} from '../../decorators/permissions.decorator';
import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  TraceItemReqDto,
  TraceOrderReqDto,
  TracePurchaseReqDto,
  TraceSupplierReqDto,
} from './dto/integration-trace.req.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOnBehalfGuard } from './guards/integration-on-behalf.guard';
import { IntegrationTraceService } from './integration-trace.service';

// Truy vết đi qua nhiều miền nên đòi đủ quyền đọc của mọi miền nó chạm tới
@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, IntegrationOnBehalfGuard, ThrottlerGuard)
@Controller({ path: 'integration', version: '1' })
export class IntegrationTraceController {
  constructor(private readonly traceService: IntegrationTraceService) {}

  @Get('trace-order')
  @Permissions(
    'orders:read',
    'production:read',
    'purchasing:read',
    'purchase-requests:read',
    'iqc:read',
    'oqc:read',
    'outsourcing:read',
    'inventory:read',
  )
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Truy vết một đơn bán qua lệnh sản xuất, job, công đoạn, OQC, đề nghị mua, đơn mua, nhập kho, IQC và trả hàng; bỏ trống mã đơn thì tiến độ các đơn đang chạy',
  })
  traceOrder(
    @Query() reqDto: TraceOrderReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.traceService.traceOrder(reqDto);
  }

  @Get('trace-purchase')
  @Permissions(
    'purchasing:read',
    'purchase-requests:read',
    'iqc:read',
    'inventory:read',
  )
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Truy vết một chứng từ mua hàng từ đề nghị mua đến đơn mua, nhập kho, IQC, trả nhà cung cấp và thanh toán',
  })
  tracePurchase(
    @Query() reqDto: TracePurchaseReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.traceService.tracePurchase(reqDto);
  }

  @Get('trace-supplier')
  @Permissions(
    'suppliers:read',
    'purchasing:read',
    'purchase-requests:read',
    'iqc:read',
    'orders:read',
    'clients:read',
    'outsourcing:read',
    'inventory:read',
  )
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Truy vết một nhà cung cấp: đơn mua còn mở, IQC không đạt gần đây, phiếu trả chưa xuất, gia công ngoài còn mở và các đơn bán bị ảnh hưởng',
  })
  traceSupplier(
    @Query() reqDto: TraceSupplierReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.traceService.traceSupplier(reqDto);
  }

  @Get('trace-item')
  @PermissionsByParam('view', {
    supply: ['purchase-requests:read', 'purchasing:read', 'suppliers:read'],
    structure: 'operations:read',
  })
  @Permissions('items:read', 'inventory:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Truy vết một vật tư hoặc sản phẩm: view=supply cho sản phẩm dùng nó, đề nghị mua và đơn mua còn mở; view=structure cho cây BOM và công đoạn',
  })
  traceItem(
    @Query() reqDto: TraceItemReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.traceService.traceItem(reqDto);
  }
}
