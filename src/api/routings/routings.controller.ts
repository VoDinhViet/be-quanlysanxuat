import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateRoutingOperationReqDto } from './dto/create-routing-operation.req.dto';
import { RoutingOperationResDto } from './dto/routing-operation.res.dto';
import { UpdateRoutingOperationReqDto } from './dto/update-routing-operation.req.dto';
import { RoutingsService } from './routings.service';

@ApiTags('Items')
@Controller('items/:itemId/operations')
export class RoutingsController {
  constructor(private readonly routingsService: RoutingsService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: RoutingOperationResDto,
    summary: "Get an item's own routing (Cấp 0, Công đoạn), in run order",
    isArray: true,
  })
  getRoutingOperations(
    @UUIDParam('itemId') itemId: string,
  ): Promise<RoutingOperationResDto[]> {
    return this.routingsService.getRoutingOperations(itemId);
  }

  @Post()
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary: 'Create a routing step ("[+]") for this item',
    statusCode: HttpStatus.CREATED,
  })
  createRoutingOperation(
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: CreateRoutingOperationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.routingsService.createRoutingOperation(
      itemId,
      reqDto,
      payload.userId,
    );
  }

  @Patch(':stepId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary: 'Update a routing step (STT chạy/note)',
  })
  updateRoutingOperation(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('stepId') stepId: string,
    @Body() reqDto: UpdateRoutingOperationReqDto,
  ): Promise<void> {
    return this.routingsService.updateRoutingOperation(itemId, stepId, reqDto);
  }

  @Delete(':stepId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary: 'Delete a routing step ("[X]")',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteRoutingOperation(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('stepId') stepId: string,
  ): Promise<void> {
    return this.routingsService.deleteRoutingOperation(itemId, stepId);
  }
}
