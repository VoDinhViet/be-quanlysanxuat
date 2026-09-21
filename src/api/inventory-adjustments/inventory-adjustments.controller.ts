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
import { CreateInventoryAdjustmentReqDto } from './dto/create-inventory-adjustment.req.dto';
import { GetInventoryAdjustmentsReqDto } from './dto/get-inventory-adjustments.req.dto';
import { InventoryAdjustmentResDto } from './dto/inventory-adjustment.res.dto';
import { PageInventoryAdjustmentResDto } from './dto/page-inventory-adjustment.res.dto';
import { UpdateInventoryAdjustmentReqDto } from './dto/update-inventory-adjustment.req.dto';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';

@ApiTags('Inventory Adjustments')
@Controller('inventory-adjustments')
export class InventoryAdjustmentsController {
  constructor(
    private readonly inventoryAdjustmentsService: InventoryAdjustmentsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: PageInventoryAdjustmentResDto,
    summary:
      'List inventory adjustments (phiếu điều chỉnh tồn — kiểm kê/hao hụt)',
    isPaginated: true,
  })
  getInventoryAdjustments(
    @Query() reqDto: GetInventoryAdjustmentsReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryAdjustmentResDto>> {
    return this.inventoryAdjustmentsService.getInventoryAdjustments(reqDto);
  }

  @Get(':adjustmentId')
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryAdjustmentResDto,
    summary: 'Get inventory adjustment detail',
  })
  getInventoryAdjustment(
    @UUIDParam('adjustmentId') adjustmentId: string,
  ): Promise<InventoryAdjustmentResDto> {
    return this.inventoryAdjustmentsService.getInventoryAdjustment(
      adjustmentId,
    );
  }

  @Post()
  @Permissions('inventory:create')
  @ApiAuth({
    summary:
      'Create an inventory adjustment — always DRAFT, does not touch stock',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createInventoryAdjustment(
    @Body() reqDto: CreateInventoryAdjustmentReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryAdjustmentsService.createInventoryAdjustment(
      reqDto,
      payload.userId,
    );
  }

  @Patch(':adjustmentId')
  @Permissions('inventory:update')
  @ApiAuth({
    summary: 'Update an inventory adjustment — only while DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateInventoryAdjustment(
    @UUIDParam('adjustmentId') adjustmentId: string,
    @Body() reqDto: UpdateInventoryAdjustmentReqDto,
  ): Promise<void> {
    return this.inventoryAdjustmentsService.updateInventoryAdjustment(
      adjustmentId,
      reqDto,
    );
  }

  @Delete(':adjustmentId')
  @Permissions('inventory:delete')
  @ApiAuth({
    summary: 'Delete an inventory adjustment — only while DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteInventoryAdjustment(
    @UUIDParam('adjustmentId') adjustmentId: string,
  ): Promise<void> {
    return this.inventoryAdjustmentsService.deleteInventoryAdjustment(
      adjustmentId,
    );
  }

  @Post(':adjustmentId/post')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Post a DRAFT adjustment — sinh bút toán + cộng/trừ tồn, sau đó phiếu bất biến',
    statusCode: HttpStatus.NO_CONTENT,
  })
  postInventoryAdjustment(
    @UUIDParam('adjustmentId') adjustmentId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryAdjustmentsService.postInventoryAdjustment(
      adjustmentId,
      payload.userId,
    );
  }

  @Post(':adjustmentId/cancel')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Cancel an adjustment — from DRAFT just voids it; from POSTED reverses its transactions first',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelInventoryAdjustment(
    @UUIDParam('adjustmentId') adjustmentId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryAdjustmentsService.cancelInventoryAdjustment(
      adjustmentId,
      payload.userId,
    );
  }
}
