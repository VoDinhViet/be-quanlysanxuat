import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateStockReceiptReqDto } from './dto/create-stock-receipt.req.dto';
import { GetStockReceiptsReqDto } from './dto/get-stock-receipts.req.dto';
import { StockReceiptResDto } from './dto/stock-receipt.res.dto';
import { UpdateStockReceiptReqDto } from './dto/update-stock-receipt.req.dto';
import { StockReceiptsService } from './stock-receipts.service';

@ApiTags('Inventory')
@Controller('stock-receipts')
export class StockReceiptsController {
  constructor(private readonly stockReceiptsService: StockReceiptsService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: StockReceiptResDto,
    summary: 'List stock receipts (phiếu nhập/xuất kho)',
    isPaginated: true,
  })
  getStockReceipts(
    @Query() reqDto: GetStockReceiptsReqDto,
  ): Promise<OffsetPaginatedDto<StockReceiptResDto>> {
    return this.stockReceiptsService.getStockReceipts(reqDto);
  }

  @Get(':receiptId')
  @Permissions('inventory:read')
  @ApiAuth({
    type: StockReceiptResDto,
    summary: 'Get stock receipt detail',
  })
  getStockReceiptDetail(
    @UUIDParam('receiptId') receiptId: string,
  ): Promise<StockReceiptResDto> {
    return this.stockReceiptsService.getStockReceiptDetail(receiptId);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiAuth({
    type: StockReceiptResDto,
    summary: 'Create a stock receipt',
    statusCode: HttpStatus.CREATED,
  })
  createStockReceipt(
    @Body() reqDto: CreateStockReceiptReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<StockReceiptResDto> {
    return this.stockReceiptsService.createStockReceipt(reqDto, payload.userId);
  }

  @Patch(':receiptId')
  @Permissions('inventory:update')
  @ApiAuth({
    type: StockReceiptResDto,
    summary: 'Update a stock receipt',
  })
  updateStockReceipt(
    @UUIDParam('receiptId') receiptId: string,
    @Body() reqDto: UpdateStockReceiptReqDto,
  ): Promise<StockReceiptResDto> {
    return this.stockReceiptsService.updateStockReceipt(receiptId, reqDto);
  }

  @Delete(':receiptId')
  @Permissions('inventory:delete')
  @ApiAuth({
    summary: 'Delete a stock receipt (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteStockReceipt(@UUIDParam('receiptId') receiptId: string): Promise<void> {
    return this.stockReceiptsService.deleteStockReceipt(receiptId);
  }
}
