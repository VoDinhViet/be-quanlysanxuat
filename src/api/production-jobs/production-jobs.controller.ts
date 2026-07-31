import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { GetProductionJobMaterialsReqDto } from './dto/get-production-job-materials.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobMaterialResDto } from './dto/production-job-material.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { ProductionJobStepResDto } from './dto/production-job-step.res.dto';
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

  @Get(':jobId/steps')
  @Permissions('production:read')
  @ApiAuth({
    type: ProductionJobStepResDto,
    isArray: true,
    summary: 'Snapshot công đoạn (routing Cấp 0) đã đóng băng lúc duyệt LSX',
  })
  getProductionJobSteps(
    @UUIDParam('jobId') jobId: string,
  ): Promise<ProductionJobStepResDto[]> {
    return this.productionJobsService.getProductionJobSteps(jobId);
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
    return this.productionJobsService.startJob(jobId, payload.sub);
  }
}
