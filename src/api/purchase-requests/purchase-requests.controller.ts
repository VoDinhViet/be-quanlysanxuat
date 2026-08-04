import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetPurchaseRequestsReqDto } from './dto/get-purchase-requests.req.dto';
import { PurchaseRequestResDto } from './dto/purchase-request.res.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

@ApiTags('Purchase Requests')
@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
  ) {}

  @Get()
  @Permissions('purchase-requests:read')
  @ApiAuth({
    type: PurchaseRequestResDto,
    summary: 'List purchase requests',
    isPaginated: true,
  })
  getPurchaseRequests(
    @Query() reqDto: GetPurchaseRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseRequestResDto>> {
    return this.purchaseRequestsService.getPurchaseRequests(reqDto);
  }
}
