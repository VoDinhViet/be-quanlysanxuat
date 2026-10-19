import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { Permissions } from '../../decorators/permissions.decorator';
import { ApiPublic } from '../../decorators/http.decorators';
import { IntegrationResultResDto } from './dto/integration-common.dto';
import {
  IqcFailBySupplierReqDto,
  OpenNcrReqDto,
  QualityInspectionRateReqDto,
  QualitySummaryReqDto,
  QualityWatchlistReqDto,
} from './dto/integration-quality.req.dto';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOnBehalfGuard } from './guards/integration-on-behalf.guard';
import { IntegrationQualityService } from './integration-quality.service';

@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, IntegrationOnBehalfGuard, ThrottlerGuard)
@Controller({ path: 'integration', version: '1' })
export class IntegrationQualityController {
  constructor(private readonly qualityService: IntegrationQualityService) {}

  @Get('quality-inspection-rate')
  @Permissions('iqc:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Số phiếu kiểm chất lượng đã xong theo kết quả (đạt, không đạt), nhóm theo ngày, nhà cung cấp hoặc loại',
  })
  qualityInspectionRate(
    @Query() reqDto: QualityInspectionRateReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.qualityService.qualityInspectionRate(reqDto);
  }

  @Get('iqc-fail-by-supplier')
  @Permissions('iqc:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Tỉ lệ kiểm đầu vào không đạt theo nhà cung cấp (chỉ nhà cung cấp có ít nhất một lần không đạt)',
  })
  iqcFailBySupplier(
    @Query() reqDto: IqcFailBySupplierReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.qualityService.iqcFailBySupplier(reqDto);
  }

  @Get('open-ncr')
  @Permissions('iqc:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Phiếu kiểm không đạt còn mở (chưa xong, hoặc xong nhưng chưa có cách xử lý)',
  })
  openNcr(@Query() reqDto: OpenNcrReqDto): Promise<IntegrationResultResDto> {
    return this.qualityService.openNcr(reqDto);
  }

  @Get('quality-summary')
  @Permissions('iqc:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Số phiếu kiểm chất lượng đã xong theo kết quả (nhóm theo ngày, nhà cung cấp, loại) hoặc tỉ lệ kiểm đầu vào không đạt theo nhà cung cấp',
  })
  summarizeQuality(
    @Query() reqDto: QualitySummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.qualityService.summarizeQuality(reqDto);
  }

  @Get('quality-watchlist')
  @Permissions('iqc:read')
  @ApiPublic({
    type: IntegrationResultResDto,
    summary:
      'Phiếu kiểm không đạt còn mở (chưa xong, hoặc xong nhưng chưa có cách xử lý)',
  })
  listQualityWatchlist(
    @Query() reqDto: QualityWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.qualityService.listQualityWatchlist(reqDto);
  }
}
