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

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { RoutingsService } from './routings.service';
import { CreateRoutingOperationReqDto } from './dto/create-routing-operation.req.dto';
import { GetRoutingOperationsReqDto } from './dto/get-routing-operations.req.dto';
import { RoutingOperationResDto } from './dto/routing-operation.res.dto';
import { UpdateRoutingOperationReqDto } from './dto/update-routing-operation.req.dto';

@ApiTags('Boms')
@Controller('items/:itemId/operations')
export class RoutingsController {
  constructor(private readonly routingsService: RoutingsService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: RoutingOperationResDto,
    summary:
      "List an item's own routing (as-used, Công đoạn Cấp 0), in run order",
    isPaginated: true,
  })
  getOperations(
    @UUIDParam('itemId') itemId: string,
    @Query() reqDto: GetRoutingOperationsReqDto,
  ): Promise<OffsetPaginatedDto<RoutingOperationResDto>> {
    return this.routingsService.getOperations(itemId, reqDto);
  }

  @Post()
  @Permissions('items:bom-manage')
  @ApiAuth({
    type: RoutingOperationResDto,
    summary: 'Create a routing step ("[+]") for Cấp 0 of this item',
    statusCode: HttpStatus.CREATED,
  })
  createOperation(
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: CreateRoutingOperationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<RoutingOperationResDto> {
    return this.routingsService.createOperation(itemId, reqDto, payload.userId);
  }

  @Patch(':stepId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    type: RoutingOperationResDto,
    summary: 'Update a routing step (STT chạy/note)',
  })
  updateOperation(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('stepId') stepId: string,
    @Body() reqDto: UpdateRoutingOperationReqDto,
  ): Promise<RoutingOperationResDto> {
    return this.routingsService.updateOperation(itemId, stepId, reqDto);
  }

  @Delete(':stepId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary: 'Delete a routing step ("[X]")',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOperation(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('stepId') stepId: string,
  ): Promise<void> {
    return this.routingsService.deleteOperation(itemId, stepId);
  }
}
