import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
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
import { AqlPlanResDto } from '../iqc/dto/aql-plan.res.dto';
import { GetAqlPlanReqDto } from '../iqc/dto/get-aql-plan.req.dto';
import { ConfirmOqcReqDto } from './dto/confirm-oqc.req.dto';
import { GetOqcsReqDto } from './dto/get-oqcs.req.dto';
import { OqcResDto } from './dto/oqc.res.dto';
import { PageOqcResDto } from './dto/page-oqc.res.dto';
import { OqcService } from './oqc.service';

@ApiTags('OQC')
@Controller('oqc')
export class OqcController {
  constructor(private readonly oqcService: OqcService) {}

  @Get()
  @Permissions('oqc:read')
  @ApiAuth({
    type: PageOqcResDto,
    summary: 'List phiếu OQC (kiểm chất lượng lô thành phẩm)',
    isPaginated: true,
  })
  getOqcs(
    @Query() reqDto: GetOqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageOqcResDto>> {
    return this.oqcService.getOqcs(reqDto);
  }

  @Get('aql-plan')
  @Permissions('oqc:read')
  @ApiAuth({
    type: AqlPlanResDto,
    summary: 'Tra cỡ mẫu (n) + Ac/Re từ bảng AQL — auto-suggest lúc confirm',
  })
  getAqlPlan(@Query() reqDto: GetAqlPlanReqDto): Promise<AqlPlanResDto> {
    return this.oqcService.getAqlPlan(reqDto);
  }

  @Get(':oqcId')
  @Permissions('oqc:read')
  @ApiAuth({
    type: OqcResDto,
    summary: 'Chi tiết phiếu OQC',
  })
  getOqc(@UUIDParam('oqcId') oqcId: string): Promise<OqcResDto> {
    return this.oqcService.getOqc(oqcId);
  }

  @Post(':oqcId/confirm')
  @Permissions('oqc:update')
  @ApiAuth({
    summary:
      'Lưu kết quả kiểm QC — ghi đè toàn bộ mỗi lần gọi, gọi lại được nhiều lần trừ khi đã COMPLETED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  confirmOqc(
    @UUIDParam('oqcId') oqcId: string,
    @Body() reqDto: ConfirmOqcReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.oqcService.confirmOqc(oqcId, reqDto, payload.userId);
  }

  @Delete(':oqcId')
  @Permissions('oqc:delete')
  @ApiAuth({
    summary: 'Xoá phiếu OQC — chỉ khi còn NOT_INSPECTED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOqc(@UUIDParam('oqcId') oqcId: string): Promise<void> {
    return this.oqcService.deleteOqc(oqcId);
  }
}
