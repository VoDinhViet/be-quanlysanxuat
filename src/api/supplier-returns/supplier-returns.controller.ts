import { Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { GetSupplierReturnsReqDto } from './dto/get-supplier-returns.req.dto';
import { PageSupplierReturnResDto } from './dto/page-supplier-return.res.dto';
import { SupplierReturnResDto } from './dto/supplier-return.res.dto';
import { SupplierReturnsService } from './supplier-returns.service';

@ApiTags('Supplier Returns')
@Controller('supplier-returns')
export class SupplierReturnsController {
  constructor(
    private readonly supplierReturnsService: SupplierReturnsService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: PageSupplierReturnResDto,
    summary: 'List phiếu trả NCC',
    isPaginated: true,
  })
  getSupplierReturns(
    @Query() reqDto: GetSupplierReturnsReqDto,
  ): Promise<OffsetPaginatedDto<PageSupplierReturnResDto>> {
    return this.supplierReturnsService.getSupplierReturns(reqDto);
  }

  @Get(':supplierReturnId')
  @Permissions('inventory:read')
  @ApiAuth({
    type: SupplierReturnResDto,
    summary: 'Get supplier return detail',
  })
  getSupplierReturn(
    @UUIDParam('supplierReturnId') supplierReturnId: string,
  ): Promise<SupplierReturnResDto> {
    return this.supplierReturnsService.getSupplierReturn(supplierReturnId);
  }

  @Post(':supplierReturnId/post')
  @Permissions('inventory:update')
  @ApiAuth({
    summary:
      'Xác nhận xuất trả NCC (DRAFT → POSTED) — trừ tồn (nếu phiếu nhập gốc đã POSTED) và hoàn ' +
      'tất luôn phiếu IQC liên kết',
    statusCode: HttpStatus.NO_CONTENT,
  })
  postSupplierReturn(
    @UUIDParam('supplierReturnId') supplierReturnId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.supplierReturnsService.postSupplierReturn(
      supplierReturnId,
      payload.userId,
    );
  }
}
