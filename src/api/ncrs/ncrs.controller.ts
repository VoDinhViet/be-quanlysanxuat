import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateNcrProductionOrderReqDto } from './dto/create-ncr-production-order.req.dto';
import { CreateNcrReqDto } from './dto/create-ncr.req.dto';
import { GetNcrsReqDto } from './dto/get-ncrs.req.dto';
import { NcrDetailResDto } from './dto/ncr-detail.res.dto';
import { NcrOperationResDto } from './dto/ncr-operation.res.dto';
import { NcrResDto } from './dto/ncr.res.dto';
import { RejectNcrReqDto } from './dto/reject-ncr.req.dto';
import { RequestNcrOqcReqDto } from './dto/request-ncr-oqc.req.dto';
import { SaveNcrCostLinesReqDto } from './dto/save-ncr-cost-lines.req.dto';
import { UpdateNcrReqDto } from './dto/update-ncr.req.dto';
import { NcrsService } from './ncrs.service';

@ApiTags('NCRs')
@Controller('ncrs')
export class NcrsController {
  constructor(private readonly ncrsService: NcrsService) {}

  @Get()
  @Permissions('ncr:read')
  @ApiAuth({ type: NcrResDto, summary: 'List NCR', isPaginated: true })
  getNcrs(
    @Query() reqDto: GetNcrsReqDto,
  ): Promise<OffsetPaginatedDto<NcrResDto>> {
    return this.ncrsService.getNcrs(reqDto);
  }

  @Post()
  @Permissions('ncr:create')
  @ApiAuth({
    summary: 'Tạo tay NCR-NB / NCR-KH',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createNcr(
    @Body() reqDto: CreateNcrReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.createNcr(reqDto, payload.userId);
  }

  @Get(':ncrId')
  @Permissions('ncr:read')
  @ApiAuth({ type: NcrDetailResDto, summary: 'Chi tiết NCR' })
  getNcr(@UUIDParam('ncrId') ncrId: string): Promise<NcrDetailResDto> {
    return this.ncrsService.getNcr(ncrId);
  }

  @Get(':ncrId/operations')
  @Permissions('ncr:read')
  @ApiAuth({
    type: NcrOperationResDto,
    summary: 'Công đoạn của sản phẩm để chọn công đoạn sửa chữa',
  })
  getNcrOperations(
    @UUIDParam('ncrId') ncrId: string,
  ): Promise<NcrOperationResDto[]> {
    return this.ncrsService.getNcrOperations(ncrId);
  }

  @Patch(':ncrId')
  @Permissions('ncr:update')
  @ApiAuth({
    summary: 'Nhập phân tích / phương án xử lý — chỉ khi OPEN hoặc REJECTED',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateNcr(
    @UUIDParam('ncrId') ncrId: string,
    @Body() reqDto: UpdateNcrReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.updateNcr(ncrId, reqDto, payload.userId);
  }

  @Post(':ncrId/submit')
  @Permissions('ncr:update')
  @ApiAuth({
    summary: 'Gửi Giám đốc duyệt',
    statusCode: HttpStatus.NO_CONTENT,
  })
  submitNcr(
    @UUIDParam('ncrId') ncrId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.submitNcr(ncrId, payload.userId);
  }

  @Post(':ncrId/approve')
  @Permissions('ncr:approve')
  @ApiAuth({ summary: 'Duyệt NCR', statusCode: HttpStatus.NO_CONTENT })
  approveNcr(
    @UUIDParam('ncrId') ncrId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.approveNcr(ncrId, payload.userId);
  }

  @Post(':ncrId/reject')
  @Permissions('ncr:approve')
  @ApiAuth({
    summary: 'Không duyệt NCR — lý do bắt buộc',
    statusCode: HttpStatus.NO_CONTENT,
  })
  rejectNcr(
    @UUIDParam('ncrId') ncrId: string,
    @Body() reqDto: RejectNcrReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.rejectNcr(ncrId, reqDto, payload.userId);
  }

  @Post(':ncrId/close')
  @Permissions('ncr:update')
  @ApiAuth({
    summary: 'Đóng NCR chỉ ghi nhận (không có SL sửa chữa / làm mới)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  closeNcr(
    @UUIDParam('ncrId') ncrId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.closeNcr(ncrId, payload.userId);
  }

  @Post(':ncrId/production-order')
  @Permissions('ncr:update')
  @ApiAuth({
    summary: 'Tạo LSX phụ sửa chữa / làm mới — NCR đã duyệt',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createProductionOrder(
    @UUIDParam('ncrId') ncrId: string,
    @Body() reqDto: CreateNcrProductionOrderReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.createProductionOrder(
      ncrId,
      reqDto,
      payload.userId,
    );
  }

  @Post(':ncrId/skip-production-order')
  @Permissions('ncr:update')
  @ApiAuth({
    summary: 'Không tạo LSX — chuyển NCR sang chờ OQC lại',
    statusCode: HttpStatus.NO_CONTENT,
  })
  completeWithoutProductionOrder(
    @UUIDParam('ncrId') ncrId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.completeWithoutProductionOrder(
      ncrId,
      payload.userId,
    );
  }

  @Post(':ncrId/oqc')
  @Permissions('ncr:update', 'oqc:create')
  @ApiAuth({
    summary: 'Yêu cầu OQC lại cho hàng đã xử lý',
    statusCode: HttpStatus.NO_CONTENT,
  })
  requestOqc(
    @UUIDParam('ncrId') ncrId: string,
    @Body() reqDto: RequestNcrOqcReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.ncrsService.requestOqc(ncrId, reqDto, payload.userId);
  }

  @Put(':ncrId/cost-lines')
  @Permissions('ncr:update')
  @ApiAuth({
    summary: 'Lưu dòng dự toán chi phí (thay toàn bộ)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  saveCostLines(
    @UUIDParam('ncrId') ncrId: string,
    @Body() reqDto: SaveNcrCostLinesReqDto,
  ): Promise<void> {
    return this.ncrsService.saveCostLines(ncrId, reqDto);
  }
}
