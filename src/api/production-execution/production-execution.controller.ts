import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateJobOperationReportReqDto } from './dto/create-job-operation-report.req.dto';
import { GetProductionExecutionJobsReqDto } from './dto/get-production-execution-jobs.req.dto';
import { GetProductionExecutionOperationsReqDto } from './dto/get-production-execution-operations.req.dto';
import { PageProductionExecutionJobResDto } from './dto/page-production-execution-job.res.dto';
import { ProductionExecutionOperationResDto } from './dto/production-execution-operation.res.dto';
import { ProductionExecutionService } from './production-execution.service';

@ApiTags('Production Execution')
@Controller('production-execution')
export class ProductionExecutionController {
  constructor(
    private readonly productionExecutionService: ProductionExecutionService,
  ) {}

  @Get('operations')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionExecutionOperationResDto,
    isArray: true,
    summary:
      '"Thực hiện sản xuất" bước 1 — thẻ chọn công đoạn, một thẻ / công đoạn có ít nhất 1 Job khớp bộ lọc',
  })
  getOperations(
    @Query() reqDto: GetProductionExecutionOperationsReqDto,
  ): Promise<ProductionExecutionOperationResDto[]> {
    return this.productionExecutionService.getOperations(reqDto);
  }

  @Get('jobs')
  @Permissions('production:read')
  @ApiAuth({
    type: PageProductionExecutionJobResDto,
    isPaginated: true,
    summary:
      '"Thực hiện sản xuất" bước 2 — danh sách công việc của một công đoạn đang chọn',
  })
  getJobs(
    @Query() reqDto: GetProductionExecutionJobsReqDto,
  ): Promise<OffsetPaginatedDto<PageProductionExecutionJobResDto>> {
    return this.productionExecutionService.getJobs(reqDto);
  }

  @Post('operations/:jobOperationId/reports')
  @Permissions('production:update')
  @ApiAuth({
    summary:
      '"Thực hiện sản xuất" bước 4 — lưu báo cáo hoàn thành lần này cho một Part, cộng dồn ' +
      '(khác PATCH .../operations/:operationId, ghi đè)',
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
      payload.userId,
    );
  }
}
