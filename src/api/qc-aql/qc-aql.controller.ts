import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateQcAqlPlanReqDto } from './dto/create-qc-aql-plan.req.dto';
import { GetQcAqlPlansReqDto } from './dto/get-qc-aql-plans.req.dto';
import { PageQcAqlPlanResDto } from './dto/page-qc-aql-plan.res.dto';
import { QcAqlPlanResDto } from './dto/qc-aql-plan.res.dto';
import { UpdateQcAqlPlanReqDto } from './dto/update-qc-aql-plan.req.dto';
import { QcAqlService } from './qc-aql.service';

@ApiTags('QC AQL')
@Controller('qc-aql/plans')
export class QcAqlController {
  constructor(private readonly qcAqlService: QcAqlService) {}

  @Get()
  @Permissions('qc-aql:read')
  @ApiAuth({
    type: PageQcAqlPlanResDto,
    summary: 'List phương án lấy mẫu AQL',
    isPaginated: true,
  })
  getQcAqlPlans(
    @Query() reqDto: GetQcAqlPlansReqDto,
  ): Promise<OffsetPaginatedDto<PageQcAqlPlanResDto>> {
    return this.qcAqlService.getQcAqlPlans(reqDto);
  }

  @Get(':planId')
  @Permissions('qc-aql:read')
  @ApiAuth({
    type: QcAqlPlanResDto,
    summary: 'Chi tiết một phương án AQL kèm toàn bộ rule',
  })
  getQcAqlPlan(@UUIDParam('planId') planId: string): Promise<QcAqlPlanResDto> {
    return this.qcAqlService.getQcAqlPlan(planId);
  }

  @Post()
  @Permissions('qc-aql:create')
  @ApiAuth({
    type: QcAqlPlanResDto,
    summary: 'Tạo phương án AQL mới',
  })
  createQcAqlPlan(
    @Body() reqDto: CreateQcAqlPlanReqDto,
  ): Promise<QcAqlPlanResDto> {
    return this.qcAqlService.createQcAqlPlan(reqDto);
  }

  @Patch(':planId')
  @Permissions('qc-aql:update')
  @ApiAuth({
    type: QcAqlPlanResDto,
    summary:
      'Sửa phương án AQL — gửi field rules thì xoá + chèn lại toàn bộ rule',
  })
  updateQcAqlPlan(
    @UUIDParam('planId') planId: string,
    @Body() reqDto: UpdateQcAqlPlanReqDto,
  ): Promise<QcAqlPlanResDto> {
    return this.qcAqlService.updateQcAqlPlan(planId, reqDto);
  }
}
