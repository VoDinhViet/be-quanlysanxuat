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
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { BomOperationsService } from './bom-operations.service';
import { BomOperationResDto } from './dto/bom-operation.res.dto';
import { CreateBomOperationReqDto } from './dto/create-bom-operation.req.dto';
import { GetBomOperationsReqDto } from './dto/get-bom-operations.req.dto';
import { UpdateBomOperationReqDto } from './dto/update-bom-operation.req.dto';

@ApiTags('Boms')
@Controller('products/:productId/bom/items/:itemId/operations')
export class BomOperationsController {
  constructor(private readonly bomOperationsService: BomOperationsService) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: BomOperationResDto,
    summary:
      "List one BOM node's own routing (as-used, Công đoạn), in run order",
    isPaginated: true,
  })
  getOperations(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @Query() reqDto: GetBomOperationsReqDto,
  ): Promise<OffsetPaginatedDto<BomOperationResDto>> {
    return this.bomOperationsService.getBomOperations(
      productId,
      itemId,
      reqDto,
    );
  }

  @Post()
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomOperationResDto,
    summary: 'Add a routing step ("[+]") for this BOM node',
    statusCode: HttpStatus.CREATED,
  })
  addOperation(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: CreateBomOperationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<BomOperationResDto> {
    return this.bomOperationsService.addBomOperation(
      productId,
      itemId,
      reqDto,
      payload.userId,
    );
  }

  @Patch(':stepId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomOperationResDto,
    summary: 'Edit a routing step (STT chạy/note)',
  })
  updateOperation(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('stepId') stepId: string,
    @Body() reqDto: UpdateBomOperationReqDto,
  ): Promise<BomOperationResDto> {
    return this.bomOperationsService.updateBomOperation(
      productId,
      itemId,
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
    return this.bomOperationsService.deleteBomOperation(
      productId,
      itemId,
      stepId,
    );
  }
}
