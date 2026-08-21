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
import { CreateInventoryIssueReqDto } from './dto/create-inventory-issue.req.dto';
import { GetInventoryIssuesReqDto } from './dto/get-inventory-issues.req.dto';
import { InventoryIssueResDto } from './dto/inventory-issue.res.dto';
import { PageInventoryIssueResDto } from './dto/page-inventory-issue.res.dto';
import { UpdateInventoryIssueReqDto } from './dto/update-inventory-issue.req.dto';
import { InventoryIssuesService } from './inventory-issues.service';

@ApiTags('Inventory Issues')
@Controller('inventory-issues')
export class InventoryIssuesController {
  constructor(
    private readonly inventoryIssuesService: InventoryIssuesService,
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
    summary: 'Update an inventory issue — only while DRAFT',
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
    summary: 'Delete an inventory issue — only while DRAFT',
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
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryIssuesService.postInventoryIssue(
      issueId,
      payload.userId,
    );
  }

  @Post(':issueId/cancel')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Cancel an issue — from DRAFT just voids it; from POSTED reverses its transactions first',
    statusCode: HttpStatus.NO_CONTENT,
  })
  cancelInventoryIssue(
    @UUIDParam('issueId') issueId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.inventoryIssuesService.cancelInventoryIssue(
      issueId,
      payload.userId,
    );
  }
}
