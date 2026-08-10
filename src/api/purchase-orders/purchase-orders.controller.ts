import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';
import { PagePurchaseOrderResDto } from './dto/page-purchase-order.res.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('Purchase Orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PagePurchaseOrderResDto,
    summary: 'List đơn mua (PO)',
    isPaginated: true,
  })
  getPurchaseOrders(
    @Query() reqDto: GetPurchaseOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PagePurchaseOrderResDto>> {
    return this.purchaseOrdersService.getPurchaseOrders(reqDto);
  }
}
