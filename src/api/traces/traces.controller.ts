import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetItemTraceReqDto } from './dto/get-item-trace.req.dto';
import { GetOrderTraceReqDto } from './dto/get-order-trace.req.dto';
import { GetPurchaseTraceReqDto } from './dto/get-purchase-trace.req.dto';
import { GetSupplierTraceReqDto } from './dto/get-supplier-trace.req.dto';
import { TraceStepResDto } from './dto/trace-step.res.dto';
import { TracesService } from './traces.service';

// Truy vết đi qua nhiều miền nên mỗi route đòi đủ quyền đọc của mọi miền nó chạm tới
@ApiTags('Traces')
@Controller('traces')
export class TracesController {
  constructor(private readonly tracesService: TracesService) {}

  @Get('order')
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
  @ApiAuth({
    type: TraceStepResDto,
    isArray: true,
    summary:
      'Trace a sales order through production orders, jobs, operations, OQC, purchase requests, purchase orders, receipts, IQC and returns',
  })
  getOrderTrace(
    @Query() reqDto: GetOrderTraceReqDto,
  ): Promise<TraceStepResDto[]> {
    return this.tracesService.traceOrder(reqDto.orderCode);
  }

  @Get('purchase')
  @Permissions(
    'purchasing:read',
    'purchase-requests:read',
    'iqc:read',
    'inventory:read',
  )
  @ApiAuth({
    type: TraceStepResDto,
    isArray: true,
    summary:
      'Trace a purchasing document from purchase request to purchase order, receipt, IQC, supplier return and payment',
  })
  getPurchaseTrace(
    @Query() reqDto: GetPurchaseTraceReqDto,
  ): Promise<TraceStepResDto[]> {
    return this.tracesService.tracePurchase(reqDto.code);
  }

  @Get('supplier')
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
  @ApiAuth({
    type: TraceStepResDto,
    isArray: true,
    summary:
      'Trace a supplier: open purchase orders, recent IQC failures, pending returns, open outsourcing and the sales orders affected',
  })
  getSupplierTrace(
    @Query() reqDto: GetSupplierTraceReqDto,
  ): Promise<TraceStepResDto[]> {
    return this.tracesService.traceSupplier(reqDto.supplier);
  }

  @Get('item-supply')
  @Permissions(
    'items:read',
    'inventory:read',
    'purchase-requests:read',
    'purchasing:read',
    'suppliers:read',
  )
  @ApiAuth({
    type: TraceStepResDto,
    isArray: true,
    summary:
      'Trace the supply of a material or product: products using it, open purchase requests and open purchase orders',
  })
  getItemSupplyTrace(
    @Query() reqDto: GetItemTraceReqDto,
  ): Promise<TraceStepResDto[]> {
    return this.tracesService.traceItemSupply(reqDto.itemCode);
  }

  @Get('item-structure')
  @Permissions('items:read', 'inventory:read', 'operations:read')
  @ApiAuth({
    type: TraceStepResDto,
    isArray: true,
    summary: 'Trace the BOM tree and operations of a product',
  })
  getItemStructureTrace(
    @Query() reqDto: GetItemTraceReqDto,
  ): Promise<TraceStepResDto[]> {
    return this.tracesService.traceItemStructure(reqDto.itemCode);
  }
}
