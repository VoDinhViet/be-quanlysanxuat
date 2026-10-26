import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { PermissionsService } from '../auth/permissions.service';
import { SUPER_PERMISSION } from '../../constants/permission.constant';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateInventoryIssueReqDto } from './dto/create-inventory-issue.req.dto';
import { GetInventoryIssuesReqDto } from './dto/get-inventory-issues.req.dto';
import { InventoryIssueResDto } from './dto/inventory-issue.res.dto';
import { PostInventoryIssueReqDto } from './dto/post-inventory-issue.req.dto';
import { PageInventoryIssueResDto } from './dto/page-inventory-issue.res.dto';
import { UpdateInventoryIssueReqDto } from './dto/update-inventory-issue.req.dto';
import { InventoryIssuesService } from './inventory-issues.service';

@ApiTags('Inventory Issues')
@Controller('inventory-issues')
export class InventoryIssuesController {
  constructor(
    private readonly inventoryIssuesService: InventoryIssuesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: PageInventoryIssueResDto,
    summary: 'List inventory issues (phiếu xuất kho)',
    isPaginated: true,
  })
  getInventoryIssues(
    @Query() reqDto: GetInventoryIssuesReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryIssueResDto>> {
    return this.inventoryIssuesService.getInventoryIssues(reqDto);
  }

  @Get(':issueId')
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryIssueResDto,
    summary: 'Get inventory issue detail',
  })
  getInventoryIssue(
    @UUIDParam('issueId') issueId: string,
  ): Promise<InventoryIssueResDto> {
    return this.inventoryIssuesService.getInventoryIssue(issueId);
  }

  @Get(':issueId/export-pdf')
  @Permissions('inventory:read')
  @ApiAuth({
    summary: 'Xuất PDF Phiếu xuất kho (BM 09-02)',
    fileType: 'application/pdf',
  })
  exportInventoryIssuePdf(
    @UUIDParam('issueId') issueId: string,
  ): Promise<StreamableFile> {
    return this.inventoryIssuesService.exportInventoryIssuePdf(issueId);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiAuth({
    summary: 'Create an inventory issue — always DRAFT, does not touch stock',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createInventoryIssue(
    @Body() reqDto: CreateInventoryIssueReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryIssuesService.createInventoryIssue(
      reqDto,
      payload.userId,
    );
  }

  @Patch(':issueId')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Update an inventory issue — only while DRAFT; an issue generated from a delivery order is locked (E319)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateInventoryIssue(
    @UUIDParam('issueId') issueId: string,
    @Body() reqDto: UpdateInventoryIssueReqDto,
  ): Promise<void> {
    return this.inventoryIssuesService.updateInventoryIssue(issueId, reqDto);
  }

  @Delete(':issueId')
  @Permissions('inventory:delete')
  @ApiAuth({
    summary:
      'Delete an inventory issue — only while DRAFT; an issue generated from a delivery order is locked (E319)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteInventoryIssue(@UUIDParam('issueId') issueId: string): Promise<void> {
    return this.inventoryIssuesService.deleteInventoryIssue(issueId);
  }

  @Post(':issueId/post')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Post a DRAFT issue — sinh bút toán + trừ tồn, sau đó phiếu bất biến',
    statusCode: HttpStatus.NO_CONTENT,
  })
  postInventoryIssue(
    @UUIDParam('issueId') issueId: string,
    @Body() reqDto: PostInventoryIssueReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryIssuesService.postInventoryIssue(
      issueId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':issueId/cancel')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Cancel a DRAFT issue — void it before it touches stock; POSTED is immutable. An issue generated from a delivery order also cancels that order and needs outbound:update',
    statusCode: HttpStatus.NO_CONTENT,
  })
  async cancelInventoryIssue(
    @UUIDParam('issueId') issueId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    const granted = await this.permissionsService.getPermissionCodes(
      payload.sub,
    );
    const canCancelOutboundOrder =
      granted.includes(SUPER_PERMISSION) || granted.includes('outbound:update');

    return this.inventoryIssuesService.cancelInventoryIssue(
      issueId,
      canCancelOutboundOrder,
    );
  }
}
