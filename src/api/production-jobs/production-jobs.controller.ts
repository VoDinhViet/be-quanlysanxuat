import {
  Body,
  Controller,
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
import { CreateProductionJobNoteReqDto } from './dto/create-production-job-note.req.dto';
import { GetProductionJobBomReqDto } from './dto/get-production-job-bom.req.dto';
import { GetProductionJobLogsReqDto } from './dto/get-production-job-logs.req.dto';
import { GetProductionJobNotesReqDto } from './dto/get-production-job-notes.req.dto';
import { GetProductionJobOperationsReqDto } from './dto/get-production-job-operations.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobBomItemResDto } from './dto/production-job-bom-operation.res.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobIssueResDto } from './dto/production-job-issue.res.dto';
import { ProductionJobLogResDto } from './dto/production-job-log.res.dto';
import { ProductionJobNoteResDto } from './dto/production-job-note.res.dto';
import { ProductionJobOperationResDto } from './dto/production-job-operation.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { UpdateProductionJobOperationReqDto } from './dto/update-production-job-operation.req.dto';
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
    type: ProductionJobDetailResDto,
    summary: 'Get one Job',
  })
  getProductionJob(
    @UUIDParam('jobId') jobId: string,
  ): Promise<ProductionJobDetailResDto> {
    return this.productionJobsService.getProductionJob(jobId);
  }

  @Get(':jobId/bom')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobIssueResDto,
    summary: 'Nhu cầu vật tư của Job',
    isPaginated: true,
  })
  getProductionJobBom(
    @UUIDParam('jobId') jobId: string,
    @Query() reqDto: GetProductionJobBomReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobIssueResDto>> {
    return this.productionJobsService.getProductionJobBom(jobId, reqDto);
  }

  @Get(':jobId/operations')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobBomItemResDto,
    isArray: true,
    summary:
      'Công đoạn as-used của Job (INHOUSE + OUTSOURCE), nhóm theo BOM item — dùng để lấy ' +
      'operationId cho PATCH .../operations/:operationId. `operationId` query optional lọc ' +
      'chỉ trả BOM item nào chứa đúng công đoạn đó (màn "Thực hiện sản xuất")',
  })
  getProductionJobOperations(
    @UUIDParam('jobId') jobId: string,
    @Query() reqDto: GetProductionJobOperationsReqDto,
  ): Promise<ProductionJobBomItemResDto[]> {
    return this.productionJobsService.getProductionJobOperations(
      jobId,
      reqDto.operationId,
    );
  }

  @Get(':jobId/notes')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobNoteResDto,
    summary: 'Ghi chú của Job — trao đổi tự do, không phải log thao tác',
    isPaginated: true,
  })
  getProductionJobNotes(
    @UUIDParam('jobId') jobId: string,
    @Query() reqDto: GetProductionJobNotesReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobNoteResDto>> {
    return this.productionJobsService.getProductionJobNotes(jobId, reqDto);
  }

  @Get(':jobId/logs')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobLogResDto,
    summary:
      'Lịch sử thao tác của Job — thời gian, người thực hiện, hành động, nội dung',
    isPaginated: true,
  })
  getProductionJobLogs(
    @UUIDParam('jobId') jobId: string,
    @Query() reqDto: GetProductionJobLogsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobLogResDto>> {
    return this.productionJobsService.getProductionJobLogs(jobId, reqDto);
  }

  @Post(':jobId/notes')
  @Permissions('production:update')
  @ApiAuth({
    summary: 'Đăng một ghi chú cho Job',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createProductionJobNote(
    @UUIDParam('jobId') jobId: string,
    @Body() reqDto: CreateProductionJobNoteReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.productionJobsService.createProductionJobNote(
      jobId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':jobId/start')
  @Permissions('production:update')
  @ApiAuth({
    summary:
      'Start a Job — PENDING → IN_PROGRESS. Tự tạo đề xuất mua vật tư thiếu nếu có. Sau bước này, PATCH .../operations/:operationId mở ngay, không còn bước duyệt công đoạn riêng',
    statusCode: HttpStatus.NO_CONTENT,
  })
  startJob(
    @UUIDParam('jobId') jobId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.productionJobsService.startJob(jobId, payload.userId);
  }

  @Patch(':jobId/operations/:operationId')
  @Permissions('production:update')
  @ApiAuth({
    type: ProductionJobOperationResDto,
    summary:
      'Nhập SL hoàn thành cho một công đoạn của Job (ghi đè, không cộng dồn)',
  })
  updateProductionJobOperation(
    @UUIDParam('jobId') jobId: string,
    @UUIDParam('operationId') operationId: string,
    @Body() reqDto: UpdateProductionJobOperationReqDto,
  ): Promise<ProductionJobOperationResDto> {
    return this.productionJobsService.updateProductionJobOperation(
      jobId,
      operationId,
      reqDto,
    );
  }

  @Post(':jobId/qc')
  @Permissions('oqc:create')
  @ApiAuth({
    summary:
      'Yêu cầu QC thành phẩm cho cả Job — 1 cú bấm, không cần nhập gì; chỉ chạy được khi mọi công ' +
      'đoạn đã hoàn thành và Job có node Cấp 0',
    statusCode: HttpStatus.NO_CONTENT,
  })
  requestJobQc(
    @UUIDParam('jobId') jobId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.productionJobsService.requestJobQc(jobId, payload.userId);
  }
}
