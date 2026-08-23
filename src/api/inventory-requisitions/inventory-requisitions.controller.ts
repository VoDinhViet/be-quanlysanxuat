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
import { CreateInventoryRequisitionReqDto } from './dto/create-inventory-requisition.req.dto';
import { GetInventoryRequisitionsReqDto } from './dto/get-inventory-requisitions.req.dto';
import { GetIssuableItemsReqDto } from './dto/get-issuable-items.req.dto';
import { GetJobBomLinesReqDto } from './dto/get-job-bom-lines.req.dto';
import { InventoryRequisitionResDto } from './dto/inventory-requisition.res.dto';
import { PageInventoryRequisitionResDto } from './dto/page-inventory-requisition.res.dto';
import { RejectInventoryRequisitionReqDto } from './dto/reject-inventory-requisition.req.dto';
import { RequisitionLineResDto } from './dto/requisition-line.res.dto';
import { UpdateInventoryRequisitionReqDto } from './dto/update-inventory-requisition.req.dto';
import { InventoryRequisitionLinesService } from './inventory-requisition-lines.service';
import { InventoryRequisitionsService } from './inventory-requisitions.service';

@ApiTags('Inventory Requisitions')
@Controller('inventory-requisitions')
export class InventoryRequisitionsController {
  constructor(
    private readonly inventoryRequisitionsService: InventoryRequisitionsService,
    private readonly requisitionLinesService: InventoryRequisitionLinesService,
  ) {}

  @Get()
  @Permissions('inventory-requisitions:read')
  @ApiAuth({
    type: PageInventoryRequisitionResDto,
    summary: 'List phiếu lãnh vật tư',
    isPaginated: true,
  })
  getInventoryRequisitions(
    @Query() reqDto: GetInventoryRequisitionsReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryRequisitionResDto>> {
    return this.inventoryRequisitionsService.getInventoryRequisitions(reqDto);
  }

  @Get('job-bom-lines')
  @Permissions('inventory-requisitions:read')
  @ApiAuth({
    type: RequisitionLineResDto,
    summary:
      'Popup "+ Lãnh từ LSX" — mọi vật tư trong định mức BOM của Job, kèm SL BOM/Đã lãnh/Tồn/Đã giữ/Có thể lãnh/Khả dụng/SL lãnh gợi ý',
    isPaginated: true,
  })
  getJobBomLines(
    @Query() reqDto: GetJobBomLinesReqDto,
  ): Promise<OffsetPaginatedDto<RequisitionLineResDto>> {
    return this.requisitionLinesService.getJobBomLines(reqDto);
  }

  @Get('issuable-items')
  @Permissions('inventory-requisitions:read')
  @ApiAuth({
    type: RequisitionLineResDto,
    summary:
      'Popup "+ Lãnh khác" — mọi vật tư RM tại kho đang chọn, không gắn Job (SL BOM/Đã lãnh/SL lãnh gợi ý = null)',
    isPaginated: true,
  })
  getIssuableItems(
    @Query() reqDto: GetIssuableItemsReqDto,
  ): Promise<OffsetPaginatedDto<RequisitionLineResDto>> {
    return this.requisitionLinesService.getIssuableItems(reqDto);
  }

  @Get(':requisitionId')
  @Permissions('inventory-requisitions:read')
  @ApiAuth({
    type: InventoryRequisitionResDto,
    summary: 'Chi tiết phiếu lãnh vật tư',
  })
  getInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
  ): Promise<InventoryRequisitionResDto> {
    return this.inventoryRequisitionsService.getInventoryRequisition(
      requisitionId,
    );
  }

  @Post()
  @Permissions('inventory-requisitions:create')
  @ApiAuth({
    summary: 'Lập phiếu lãnh vật tư — luôn DRAFT, không đụng tồn kho',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createInventoryRequisition(
    @Body() reqDto: CreateInventoryRequisitionReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryRequisitionsService.createInventoryRequisition(
      reqDto,
      payload.userId,
    );
  }

  @Patch(':requisitionId')
  @Permissions('inventory-requisitions:update')
  @ApiAuth({
    summary:
      'Sửa phiếu — chỉ khi DRAFT/REJECTED (REJECTED tự về DRAFT), items bắt buộc gửi lại toàn bộ',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
    @Body() reqDto: UpdateInventoryRequisitionReqDto,
  ): Promise<void> {
    return this.inventoryRequisitionsService.updateInventoryRequisition(
      requisitionId,
      reqDto,
    );
  }

  @Delete(':requisitionId')
  @Permissions('inventory-requisitions:delete')
  @ApiAuth({
    summary: 'Xoá phiếu — chỉ khi DRAFT/REJECTED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
  ): Promise<void> {
    return this.inventoryRequisitionsService.deleteInventoryRequisition(
      requisitionId,
    );
  }

  @Post(':requisitionId/send')
  @Permissions('inventory-requisitions:update')
  @ApiAuth({
    summary: 'Gửi duyệt — DRAFT/REJECTED → PENDING_APPROVAL',
    statusCode: HttpStatus.NO_CONTENT,
  })
  sendInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryRequisitionsService.sendInventoryRequisition(
      requisitionId,
      payload.userId,
    );
  }

  @Post(':requisitionId/approve')
  @Permissions('inventory-requisitions:approve')
  @ApiAuth({
    summary:
      'Duyệt — PENDING_APPROVAL → APPROVED, chốt giữ hàng (không đụng tồn kho)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  approveInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryRequisitionsService.approveInventoryRequisition(
      requisitionId,
      payload.userId,
    );
  }

  @Post(':requisitionId/reject')
  @Permissions('inventory-requisitions:approve')
  @ApiAuth({
    summary: 'Từ chối — PENDING_APPROVAL → REJECTED, lý do bắt buộc',
    statusCode: HttpStatus.NO_CONTENT,
  })
  rejectInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
    @Body() reqDto: RejectInventoryRequisitionReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryRequisitionsService.rejectInventoryRequisition(
      requisitionId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':requisitionId/issue')
  @Permissions('inventory-requisitions:issue')
  @ApiAuth({
    summary:
      'Xuất kho — APPROVED → ISSUED (điểm cuối), tự sinh phiếu xuất kho POSTED + trừ tồn',
    statusCode: HttpStatus.NO_CONTENT,
  })
  issueInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryRequisitionsService.issueInventoryRequisition(
      requisitionId,
      payload.userId,
    );
  }

  @Post(':requisitionId/cancel')
  @Permissions('inventory-requisitions:update')
  @ApiAuth({
    summary:
      'Huỷ — DRAFT/PENDING_APPROVAL/APPROVED → CANCELLED, không đảo được từ ISSUED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelInventoryRequisition(
    @UUIDParam('requisitionId') requisitionId: string,
  ): Promise<void> {
    return this.inventoryRequisitionsService.cancelInventoryRequisition(
      requisitionId,
    );
  }
}
