import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { PageUserResDto } from '../users/dto/page-user.res.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CreateOperationReqDto } from './dto/create-operation.req.dto';
import { GetOperationAssignmentsReqDto } from './dto/get-operation-assignments.req.dto';
import { GetOperationOptionsReqDto } from './dto/get-operation-options.req.dto';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationRefResDto } from './dto/operation-ref.res.dto';
import { OperationResDto } from './dto/operation.res.dto';
import { UpdateOperationAssignmentsReqDto } from './dto/update-operation-assignments.req.dto';
import { UpdateOperationReqDto } from './dto/update-operation.req.dto';
import { OperationsService } from './operations.service';

@ApiTags('Operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get()
  @Permissions('operations:read')
  @ApiAuth({
    type: OperationResDto,
    isPaginated: true,
    summary: 'List operations (công đoạn) — phân trang, tìm theo tên',
  })
  getOperations(
    @Query() reqDto: GetOperationsReqDto,
  ): Promise<OffsetPaginatedDto<OperationResDto>> {
    return this.operationsService.getOperations(reqDto);
  }

  // Declared before `:operationId` so "options" isn't parsed as an id.
  @Get('options')
  @Permissions('operations:read')
  @ApiAuth({
    type: OperationRefResDto,
    isArray: true,
    summary: 'Operation options for dropdowns/pickers (unpaginated, capped)',
  })
  getOperationOptions(
    @Query() reqDto: GetOperationOptionsReqDto,
  ): Promise<OperationRefResDto[]> {
    return this.operationsService.getOperationOptions(reqDto);
  }

  @Get(':operationId')
  @Permissions('operations:read')
  @ApiAuth({
    type: OperationResDto,
    summary: 'Get operation detail',
  })
  getOperation(
    @UUIDParam('operationId') operationId: string,
  ): Promise<OperationResDto> {
    return this.operationsService.getOperation(operationId);
  }

  @Get(':operationId/assignments')
  @Permissions('operations:read')
  @ApiAuth({
    type: PageUserResDto,
    isPaginated: true,
    summary:
      'Nhân sự được phân công vào công đoạn — phân trang, tìm theo mã/họ tên (công đoạn = tổ sản xuất)',
  })
  getOperationAssignments(
    @UUIDParam('operationId') operationId: string,
    @Query() reqDto: GetOperationAssignmentsReqDto,
  ): Promise<OffsetPaginatedDto<PageUserResDto>> {
    return this.operationsService.getOperationAssignments(operationId, reqDto);
  }

  @Get(':operationId/assignments/ids')
  @Permissions('operations:read')
  @ApiAuth({
    type: String,
    isArray: true,
    summary:
      'Toàn bộ id nhân sự đang được phân công (không phân trang) — lựa chọn ban đầu của hộp thoại phân công hàng loạt',
  })
  getOperationAssignmentIds(
    @UUIDParam('operationId') operationId: string,
  ): Promise<string[]> {
    return this.operationsService.getOperationAssignmentIds(operationId);
  }

  @Post()
  @Permissions('operations:create')
  @ApiAuth({
    summary: 'Create an operation (công đoạn)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createOperation(
    @Body() reqDto: CreateOperationReqDto,
    @CurrentUser() user: JwtPayloadType,
  ): Promise<void> {
    return this.operationsService.createOperation(reqDto, user.userId);
  }

  @Patch(':operationId')
  @Permissions('operations:update')
  @ApiAuth({
    summary: 'Update an operation (công đoạn)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateOperation(
    @UUIDParam('operationId') operationId: string,
    @Body() reqDto: UpdateOperationReqDto,
  ): Promise<void> {
    return this.operationsService.updateOperation(operationId, reqDto);
  }

  @Put(':operationId/assignments')
  @Permissions('operations:update')
  @ApiAuth({
    summary:
      'Đặt lại toàn bộ nhân sự được phân công vào công đoạn (một người có thể thuộc nhiều công đoạn)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  setOperationAssignments(
    @UUIDParam('operationId') operationId: string,
    @Body() reqDto: UpdateOperationAssignmentsReqDto,
  ): Promise<void> {
    return this.operationsService.setOperationAssignments(operationId, reqDto);
  }

  @Delete(':operationId')
  @Permissions('operations:delete')
  @ApiAuth({
    summary:
      'Delete an operation (soft delete; blocked if it has any routing/BOM step)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOperation(
    @UUIDParam('operationId') operationId: string,
  ): Promise<void> {
    return this.operationsService.deleteOperation(operationId);
  }
}
