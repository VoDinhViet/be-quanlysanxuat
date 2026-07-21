import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateOperationReqDto } from './dto/create-operation.req.dto';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationResDto } from './dto/operation.res.dto';
import { UpdateOperationReqDto } from './dto/update-operation.req.dto';
import { OperationsService } from './operations.service';

@ApiTags('Operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get()
  @Permissions('operations:read')
  @ApiPublic({
    type: OperationResDto,
    summary: 'List operations (công đoạn)',
    isPaginated: true,
  })
  getOperations(
    @Query() reqDto: GetOperationsReqDto,
  ): Promise<OffsetPaginatedDto<OperationResDto>> {
    return this.operationsService.getOperations(reqDto);
  }

  @Get(':id')
  @Permissions('operations:read')
  @ApiPublic({
    type: OperationResDto,
    summary: 'Get operation detail',
  })
  getOperationDetail(@UUIDParam('id') id: string): Promise<OperationResDto> {
    return this.operationsService.getOperationDetail(id);
  }

  @Post()
  @Permissions('operations:create')
  @ApiAuth({
    type: OperationResDto,
    summary: 'Create an operation',
    statusCode: HttpStatus.CREATED,
  })
  createOperation(
    @Body() reqDto: CreateOperationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<OperationResDto> {
    return this.operationsService.createOperation(reqDto, payload.sub);
  }

  @Patch(':id')
  @Permissions('operations:update')
  @ApiAuth({
    type: OperationResDto,
    summary: 'Update an operation',
  })
  updateOperation(
    @UUIDParam('id') id: string,
    @Body() reqDto: UpdateOperationReqDto,
  ): Promise<OperationResDto> {
    return this.operationsService.updateOperation(id, reqDto);
  }

  @Delete(':id')
  @Permissions('operations:delete')
  @ApiAuth({
    summary: 'Delete an operation (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOperation(@UUIDParam('id') id: string): Promise<void> {
    return this.operationsService.deleteOperation(id);
  }
}
