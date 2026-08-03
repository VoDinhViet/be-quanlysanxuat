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
import { FileResDto } from '../files/dto/file.res.dto';
import { CreateProductionJobNoteReqDto } from './dto/create-production-job-note.req.dto';
import { GetProductionJobMaterialsReqDto } from './dto/get-production-job-materials.req.dto';
import { GetProductionJobNotesReqDto } from './dto/get-production-job-notes.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobBomItemResDto } from './dto/production-job-bom-item.res.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobMaterialResDto } from './dto/production-job-material.res.dto';
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
    type: ProductionJobBomItemResDto,
    isArray: true,
    summary:
      'Cây BOM của Job đã đóng băng lúc duyệt LSX — danh sách phẳng cha-con (FE tự dựng cây), mỗi node kèm công đoạn as-used của nó',
  })
  getProductionJobBom(
    @UUIDParam('jobId') jobId: string,
  ): Promise<ProductionJobBomItemResDto[]> {
    return this.productionJobsService.getProductionJobBom(jobId);
  }

  @Get(':jobId/materials')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobMaterialResDto,
    summary: 'Danh sách vật tư của Job — khởi tạo từ BOM, có thể đã được sửa',
    isPaginated: true,
  })
  getProductionJobMaterials(
    @UUIDParam('jobId') jobId: string,
    @Query() reqDto: GetProductionJobMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobMaterialResDto>> {
    return this.productionJobsService.getProductionJobMaterials(jobId, reqDto);
  }

  @Get(':jobId/attachments')
  @Permissions('production:read')
  @ApiAuth({
    type: FileResDto,
    isArray: true,
    summary: 'Tài liệu đính kèm của Job — đọc xuyên từ tài liệu của sản phẩm',
  })
  getProductionJobAttachments(
    @UUIDParam('jobId') jobId: string,
  ): Promise<FileResDto[]> {
    return this.productionJobsService.getProductionJobAttachments(jobId);
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
    type: ProductionJobDetailResDto,
    summary: 'Start a Job — PENDING → IN_PROGRESS',
  })
  startJob(
    @UUIDParam('jobId') jobId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductionJobDetailResDto> {
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
}
