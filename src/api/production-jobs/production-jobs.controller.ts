import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CancelProductionJobReqDto } from './dto/cancel-production-job.req.dto';
import { GetProductionJobLogsReqDto } from './dto/get-production-job-logs.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { PauseProductionJobReqDto } from './dto/pause-production-job.req.dto';
import { ProductionJobLogResDto } from './dto/production-job-log.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { ReportProductionJobReqDto } from './dto/report-production-job.req.dto';
import { ProductionJobsService } from './production-jobs.service';

@ApiTags('Production Jobs')
@Controller('production-jobs')
export class ProductionJobsController {
  constructor(private readonly productionJobsService: ProductionJobsService) {}

  @Get()
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobResDto,
    summary:
      '"Quản lý sản xuất" — list issued Job, one row per FG product per LSX',
    isPaginated: true,
  })
  getProductionJobs(
    @Query() reqDto: GetProductionJobsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobResDto>> {
    return this.productionJobsService.getProductionJobs(reqDto);
  }

  @Get(':jobId')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobResDto,
    summary: 'Get one Job',
  })
  getProductionJobDetail(
    @UUIDParam('jobId') jobId: string,
  ): Promise<ProductionJobResDto> {
    return this.productionJobsService.getProductionJobDetail(jobId);
  }

  @Post(':jobId/start')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionJobResDto,
    summary: 'Start a Job — PENDING → IN_PROGRESS',
  })
  startJob(
    @UUIDParam('jobId') jobId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobResDto> {
    return this.productionJobsService.startJob(jobId, payload.sub);
  }

  @Post(':jobId/report')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionJobResDto,
    summary: 'Report output for a Job — cộng dồn producedQty/rejectedQty',
  })
  reportJob(
    @UUIDParam('jobId') jobId: string,
    @Body() reqDto: ReportProductionJobReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobResDto> {
    return this.productionJobsService.reportJob(jobId, reqDto, payload.sub);
  }

  @Post(':jobId/pause')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionJobResDto,
    summary: 'Pause a Job — IN_PROGRESS → PAUSED',
  })
  pauseJob(
    @UUIDParam('jobId') jobId: string,
    @Body() reqDto: PauseProductionJobReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobResDto> {
    return this.productionJobsService.pauseJob(jobId, reqDto, payload.sub);
  }

  @Post(':jobId/resume')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionJobResDto,
    summary: 'Resume a Job — PAUSED → IN_PROGRESS',
  })
  resumeJob(
    @UUIDParam('jobId') jobId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobResDto> {
    return this.productionJobsService.resumeJob(jobId, payload.sub);
  }

  @Post(':jobId/complete')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionJobResDto,
    summary:
      'Complete a Job — IN_PROGRESS/PAUSED → COMPLETED, cho phép kết thúc sớm',
  })
  completeJob(
    @UUIDParam('jobId') jobId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobResDto> {
    return this.productionJobsService.completeJob(jobId, payload.sub);
  }

  @Post(':jobId/cancel')
  @Permissions('production:approve')
  @ApiAuth({
    type: ProductionJobResDto,
    summary: 'Cancel a Job — quyết định cấp quản lý, cùng mức với duyệt LSX',
  })
  cancelJob(
    @UUIDParam('jobId') jobId: string,
    @Body() reqDto: CancelProductionJobReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobResDto> {
    return this.productionJobsService.cancelJob(jobId, reqDto, payload.sub);
  }

  @Get(':jobId/logs')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobLogResDto,
    summary: 'Get Job action log — thời gian, người thực hiện, nội dung',
    isPaginated: true,
  })
  getProductionJobLogs(
    @UUIDParam('jobId') jobId: string,
    @Query() reqDto: GetProductionJobLogsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobLogResDto>> {
    return this.productionJobsService.getProductionJobLogs(jobId, reqDto);
  }
}
