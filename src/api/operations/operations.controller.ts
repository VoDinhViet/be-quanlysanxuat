import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiPublic } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationResDto } from './dto/operation.res.dto';
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
    isArray: true,
  })
  getOperations(
    @Query() reqDto: GetOperationsReqDto,
  ): Promise<OperationResDto[]> {
    return this.operationsService.getOperations(reqDto);
  }
}
