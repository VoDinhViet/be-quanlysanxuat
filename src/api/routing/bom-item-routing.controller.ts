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
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateRoutingStepReqDto } from './dto/create-routing-step.req.dto';
import { RoutingStepResDto } from './dto/routing-step.res.dto';
import { UpdateRoutingStepReqDto } from './dto/update-routing-step.req.dto';
import { RoutingService } from './routing.service';

@ApiTags('Routing')
@Controller('products/:productId/bom/items/:itemId/operations')
export class BomItemRoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: RoutingStepResDto,
    summary:
      "Get one BOM node's own routing (as-used, Công đoạn), in run order",
    isArray: true,
  })
  getOperations(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
  ): Promise<RoutingStepResDto[]> {
    return this.routingService.getRouting({ productId, bomItemId: itemId });
  }

  @Post()
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: RoutingStepResDto,
    summary: 'Add a routing step ("[+]") for this BOM node',
    statusCode: HttpStatus.CREATED,
  })
  addOperation(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: CreateRoutingStepReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<RoutingStepResDto> {
    return this.routingService.addStep(
      { productId, bomItemId: itemId },
      reqDto,
      payload.userId,
    );
  }

  @Patch(':stepId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: RoutingStepResDto,
    summary: 'Edit a routing step (STT chạy/note)',
  })
  updateOperation(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('stepId') stepId: string,
    @Body() reqDto: UpdateRoutingStepReqDto,
  ): Promise<RoutingStepResDto> {
    return this.routingService.updateStep(
      { productId, bomItemId: itemId },
      stepId,
      reqDto,
    );
  }

  @Delete(':stepId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    summary: 'Delete a routing step ("[X]")',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOperation(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('stepId') stepId: string,
  ): Promise<void> {
    return this.routingService.deleteStep(
      { productId, bomItemId: itemId },
      stepId,
    );
  }
}
