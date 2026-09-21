import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
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
  @ApiAuth({
    type: OperationResDto,
    summary: 'List operations (công đoạn)',
    isArray: true,
  })
  getOperations(
    @Query() reqDto: GetOperationsReqDto,
  ): Promise<OperationResDto[]> {
    return this.operationsService.getOperations(reqDto);
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
