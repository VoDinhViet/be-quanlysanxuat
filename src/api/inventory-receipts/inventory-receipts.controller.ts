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

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateInventoryReceiptReqDto } from './dto/create-inventory-receipt.req.dto';
import { GetInventoryReceiptsReqDto } from './dto/get-inventory-receipts.req.dto';
import { InventoryReceiptResDto } from './dto/inventory-receipt.res.dto';
import { PageInventoryReceiptResDto } from './dto/page-inventory-receipt.res.dto';
import { UpdateInventoryReceiptReqDto } from './dto/update-inventory-receipt.req.dto';
import { InventoryReceiptsService } from './inventory-receipts.service';

@ApiTags('Inventory Receipts')
@Controller('inventory-receipts')
export class InventoryReceiptsController {
  constructor(
    private readonly inventoryReceiptsService: InventoryReceiptsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: PageInventoryReceiptResDto,
    summary: 'List inventory receipts (phiếu nhập kho)',
    isPaginated: true,
  })
  getInventoryReceipts(
    @Query() reqDto: GetInventoryReceiptsReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryReceiptResDto>> {
    return this.inventoryReceiptsService.getInventoryReceipts(reqDto);
  }

  @Get(':receiptId')
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryReceiptResDto,
    summary: 'Get inventory receipt detail',
  })
  getInventoryReceipt(
    @UUIDParam('receiptId') receiptId: string,
  ): Promise<InventoryReceiptResDto> {
    return this.inventoryReceiptsService.getInventoryReceipt(receiptId);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiAuth({
    type: InventoryReceiptResDto,
    summary: 'Create an inventory receipt — always DRAFT, does not touch stock',
    statusCode: HttpStatus.CREATED,
  })
  createInventoryReceipt(
    @Body() reqDto: CreateInventoryReceiptReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<InventoryReceiptResDto> {
    return this.inventoryReceiptsService.createInventoryReceipt(
      reqDto,
      payload.userId,
    );
  }

  @Patch(':receiptId')
  @Permissions('inventory:update')
  @ApiAuth({
    type: InventoryReceiptResDto,
    summary: 'Update an inventory receipt — only while DRAFT',
  })
  updateInventoryReceipt(
    @UUIDParam('receiptId') receiptId: string,
    @Body() reqDto: UpdateInventoryReceiptReqDto,
  ): Promise<InventoryReceiptResDto> {
    return this.inventoryReceiptsService.updateInventoryReceipt(
      receiptId,
      reqDto,
    );
  }

  @Delete(':receiptId')
  @Permissions('inventory:delete')
  @ApiAuth({
    summary: 'Delete an inventory receipt — only while DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteInventoryReceipt(
    @UUIDParam('receiptId') receiptId: string,
  ): Promise<void> {
    return this.inventoryReceiptsService.deleteInventoryReceipt(receiptId);
  }

  @Post(':receiptId/post')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Post a DRAFT receipt — sinh bút toán + cập nhật tồn, sau đó phiếu bất biến',
    statusCode: HttpStatus.NO_CONTENT,
  })
  postInventoryReceipt(
    @UUIDParam('receiptId') receiptId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryReceiptsService.postInventoryReceipt(
      receiptId,
      payload.userId,
    );
  }

  @Post(':receiptId/cancel')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Cancel a receipt — from DRAFT just voids it; from POSTED reverses its transactions first',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelInventoryReceipt(
    @UUIDParam('receiptId') receiptId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryReceiptsService.cancelInventoryReceipt(
      receiptId,
      payload.userId,
    );
  }
}
