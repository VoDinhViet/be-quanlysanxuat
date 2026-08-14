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
import { CreatePurchaseRequestReqDto } from './dto/create-purchase-request.req.dto';
import { GetPurchaseRequestsReqDto } from './dto/get-purchase-requests.req.dto';
import { PagePurchaseRequestResDto } from './dto/page-purchase-request.res.dto';
import { PurchaseRequestResDto } from './dto/purchase-request.res.dto';
import { RejectPurchaseRequestReqDto } from './dto/reject-purchase-request.req.dto';
import { UpdatePurchaseRequestItemReqDto } from './dto/update-purchase-request-item.req.dto';
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
    type: PagePurchaseRequestResDto,
    summary: 'List purchase requests',
    isPaginated: true,
  })
  getPurchaseRequests(
    @Query() reqDto: GetPurchaseRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PagePurchaseRequestResDto>> {
    return this.purchaseRequestsService.getPurchaseRequests(reqDto);
  }

  @Get(':purchaseRequestId')
  @Permissions('purchase-requests:read')
  @ApiAuth({
    type: PurchaseRequestResDto,
    summary: 'Get purchase request detail',
  })
  getPurchaseRequest(
    @UUIDParam('purchaseRequestId') purchaseRequestId: string,
  ): Promise<PurchaseRequestResDto> {
    return this.purchaseRequestsService.getPurchaseRequest(purchaseRequestId);
  }

  @Post()
  @Permissions('purchase-requests:create')
  @ApiAuth({
    summary:
      'Lập đề xuất mua hàng tay — luôn DRAFT, không gắn LSX/Job, mọi dòng phải là vật tư RM',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createPurchaseRequest(
    @Body() reqDto: CreatePurchaseRequestReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseRequestsService.createPurchaseRequest(
      reqDto,
      payload.userId,
    );
  }

  @Delete(':purchaseRequestId')
  @Permissions('purchase-requests:delete')
  @ApiAuth({
    summary:
      'Xoá cả đề xuất — chỉ khi DRAFT/REJECTED, xoá luôn mọi dòng vật tư, không khôi phục được',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deletePurchaseRequest(
    @UUIDParam('purchaseRequestId') purchaseRequestId: string,
  ): Promise<void> {
    return this.purchaseRequestsService.deletePurchaseRequest(
      purchaseRequestId,
    );
  }

  @Post(':purchaseRequestId/send')
  @Permissions('purchase-requests:update')
  @ApiAuth({
    summary: 'Gửi duyệt — DRAFT → PENDING_APPROVAL',
    statusCode: HttpStatus.NO_CONTENT,
  })
  sendPurchaseRequest(
    @UUIDParam('purchaseRequestId') purchaseRequestId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseRequestsService.sendPurchaseRequest(
      purchaseRequestId,
      payload.userId,
    );
  }

  @Post(':purchaseRequestId/approve')
  @Permissions('purchase-requests:approve')
  @ApiAuth({
    summary: 'Duyệt — PENDING_APPROVAL → APPROVED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  approvePurchaseRequest(
    @UUIDParam('purchaseRequestId') purchaseRequestId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseRequestsService.approvePurchaseRequest(
      purchaseRequestId,
      payload.userId,
    );
  }

  @Post(':purchaseRequestId/reject')
  @Permissions('purchase-requests:approve')
  @ApiAuth({
    summary:
      'Từ chối — PENDING_APPROVAL → REJECTED, lý do bắt buộc. Sửa/xoá dòng vật tư sau đó tự đưa về DRAFT',
    statusCode: HttpStatus.NO_CONTENT,
  })
  rejectPurchaseRequest(
    @UUIDParam('purchaseRequestId') purchaseRequestId: string,
    @Body() reqDto: RejectPurchaseRequestReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.purchaseRequestsService.rejectPurchaseRequest(
      purchaseRequestId,
      reqDto,
      payload.userId,
    );
  }

  @Patch(':purchaseRequestId/items/:purchaseRequestItemId')
  @Permissions('purchase-requests:update')
  @ApiAuth({
    summary:
      'Update SL đề xuất/note của một dòng vật tư — chỉ khi DRAFT/REJECTED (REJECTED tự về DRAFT)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updatePurchaseRequestItem(
    @UUIDParam('purchaseRequestId') purchaseRequestId: string,
    @UUIDParam('purchaseRequestItemId') purchaseRequestItemId: string,
    @Body() reqDto: UpdatePurchaseRequestItemReqDto,
  ): Promise<void> {
    return this.purchaseRequestsService.updatePurchaseRequestItem(
      purchaseRequestId,
      purchaseRequestItemId,
      reqDto,
    );
  }

  @Delete(':purchaseRequestId/items/:purchaseRequestItemId')
  @Permissions('purchase-requests:update')
  @ApiAuth({
    summary:
      'Xoá một dòng vật tư — chỉ khi DRAFT/REJECTED (REJECTED tự về DRAFT), phải còn ≥ 1 dòng sau khi xoá',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deletePurchaseRequestItem(
    @UUIDParam('purchaseRequestId') purchaseRequestId: string,
    @UUIDParam('purchaseRequestItemId') purchaseRequestItemId: string,
  ): Promise<void> {
    return this.purchaseRequestsService.deletePurchaseRequestItem(
      purchaseRequestId,
      purchaseRequestItemId,
    );
  }
}
