import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetPurchaseLedgerReqDto } from './dto/get-purchase-ledger.req.dto';
import { PurchaseLedgerItemResDto } from './dto/purchase-ledger-item.res.dto';
import { PurchaseLedgerService } from './purchase-ledger.service';

@ApiTags('Purchase Ledger')
@Controller('purchase-ledger')
export class PurchaseLedgerController {
  constructor(private readonly purchaseLedgerService: PurchaseLedgerService) {}

  @Get()
  @Permissions('purchasing:read')
  @ApiAuth({
    type: PurchaseLedgerItemResDto,
    summary:
      'Sổ cái mua hàng — 1 dòng/1 dòng vật tư của đề xuất đã APPROVED, trạng thái tính lúc đọc',
    isPaginated: true,
  })
  getPurchaseLedgers(
    @Query() reqDto: GetPurchaseLedgerReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseLedgerItemResDto>> {
    return this.purchaseLedgerService.getPurchaseLedgers(reqDto);
  }
}
