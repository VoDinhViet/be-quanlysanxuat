import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { ProductionJobBomItemResDto } from '../production-jobs/dto/production-job-bom-operation.res.dto';
import { CreateJobOperationReportReqDto } from './dto/create-job-operation-report.req.dto';
import { GetJobOperationReportsReqDto } from './dto/get-job-operation-reports.req.dto';
import { GetProductionExecutionJobReqDto } from './dto/get-production-execution-job.req.dto';
import { GetProductionExecutionJobsReqDto } from './dto/get-production-execution-jobs.req.dto';
import { GetProductionExecutionOperationsReqDto } from './dto/get-production-execution-operations.req.dto';
import { PageProductionExecutionJobResDto } from './dto/page-production-execution-job.res.dto';
import { ProductionExecutionJobDetailResDto } from './dto/production-execution-job-detail.res.dto';
import { ProductionExecutionOperationResDto } from './dto/production-execution-operation.res.dto';
import { ProductionExecutionReportResDto } from './dto/production-execution-report.res.dto';
import { ProductionExecutionService } from './production-execution.service';

@ApiTags('Production Execution')
@Controller('production-execution')
export class ProductionExecutionController {
  constructor(
    private readonly productionExecutionService: ProductionExecutionService,
  ) {}

  @Get('operations')
  @Permissions('production-execution:read')
  @ApiAuth({
    type: ProductionExecutionOperationResDto,
    isArray: true,
    summary:
      '"Thực hiện sản xuất" bước 1 — thẻ chọn công đoạn, một thẻ / công đoạn có ít nhất 1 Job khớp bộ lọc; người dùng chỉ thấy công đoạn được phân công (trừ khi có production-execution:read-all)',
  })
  getOperations(
    @Query() reqDto: GetProductionExecutionOperationsReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionExecutionOperationResDto[]> {
    return this.productionExecutionService.getOperations(reqDto, payload);
  }

  @Get('jobs')
  @Permissions('production-execution:read')
  @ApiAuth({
    type: PageProductionExecutionJobResDto,
    isPaginated: true,
    summary:
      '"Thực hiện sản xuất" bước 2 — danh sách công việc của một công đoạn đang chọn',
  })
  getJobs(
    @Query() reqDto: GetProductionExecutionJobsReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OffsetPaginatedDto<PageProductionExecutionJobResDto>> {
    return this.productionExecutionService.getJobs(reqDto, payload);
  }

  @Get('jobs/:productionJobId')
  @Permissions('production-execution:read')
  @ApiAuth({
    type: ProductionExecutionJobDetailResDto,
    summary:
      'Header của Job cho màn "Thực hiện sản xuất" — cần operationId thuộc phạm vi được phân công',
  })
  getJob(
    @UUIDParam('productionJobId') productionJobId: string,
    @Query() reqDto: GetProductionExecutionJobReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionExecutionJobDetailResDto> {
    return this.productionExecutionService.getJob(
      productionJobId,
      reqDto.operationId,
      payload,
    );
  }

  @Get('jobs/:productionJobId/operations')
  @Permissions('production-execution:read')
  @ApiAuth({
    type: ProductionJobBomItemResDto,
    isArray: true,
    summary:
      'Part → công đoạn của Job đã lọc theo operationId (bắt buộc, thuộc phạm vi được phân công)',
  })
  getJobOperations(
    @UUIDParam('productionJobId') productionJobId: string,
    @Query() reqDto: GetProductionExecutionJobReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobBomItemResDto[]> {
    return this.productionExecutionService.getJobOperations(
      productionJobId,
      reqDto.operationId,
      payload,
    );
  }

  @Get('jobs/:productionJobId/reports')
  @Permissions('production-execution:read')
  @ApiAuth({
    type: ProductionExecutionReportResDto,
    isPaginated: true,
    summary:
      'Lấy lịch sử báo cáo sản lượng của một Job (mỗi lần báo cáo một dòng, phân trang)',
  })
  getJobOperationReports(
    @UUIDParam('productionJobId') productionJobId: string,
    @Query() reqDto: GetJobOperationReportsReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OffsetPaginatedDto<ProductionExecutionReportResDto>> {
    return this.productionExecutionService.getJobOperationReports(
      productionJobId,
      reqDto,
      payload,
    );
  }

  @Post('operations/:jobOperationId/reports')
  @Permissions('production-execution:report')
  @ApiAuth({
    summary:
      '"Thực hiện sản xuất" bước 4 — lưu báo cáo hoàn thành lần này cho một Part, cộng dồn',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createJobOperationReport(
    @UUIDParam('jobOperationId') jobOperationId: string,
    @Body() reqDto: CreateJobOperationReportReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.productionExecutionService.createJobOperationReport(
      jobOperationId,
      reqDto,
      payload,
    );
  }
}
