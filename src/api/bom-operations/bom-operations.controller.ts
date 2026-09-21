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
import { BomOperationsService } from './bom-operations.service';
import { BomOperationResDto } from './dto/bom-operation.res.dto';
import { CreateBomOperationReqDto } from './dto/create-bom-operation.req.dto';
import { GetBomOperationsReqDto } from './dto/get-bom-operations.req.dto';
import { UpdateBomOperationReqDto } from './dto/update-bom-operation.req.dto';

@ApiTags('Boms')
@Controller('items/:itemId/bom/items/:bomItemId/operations')
export class BomOperationsController {
  constructor(private readonly bomOperationsService: BomOperationsService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: BomOperationResDto,
    summary:
      "List one BOM node's own routing (as-used, Công đoạn), in run order",
    isPaginated: true,
  })
  getOperations(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
    @Query() reqDto: GetBomOperationsReqDto,
  ): Promise<OffsetPaginatedDto<BomOperationResDto>> {
    return this.bomOperationsService.getBomOperations(
      itemId,
      bomItemId,
      reqDto,
    );
  }

  @Post()
  @Permissions('items:bom-manage')
  @ApiAuth({
    type: BomOperationResDto,
    summary: 'Create a routing step ("[+]") for this BOM node',
    statusCode: HttpStatus.CREATED,
  })
  createOperation(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
    @Body() reqDto: CreateBomOperationReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<BomOperationResDto> {
    return this.bomOperationsService.createBomOperation(
      itemId,
      bomItemId,
      reqDto,
      payload.userId,
    );
  }

  @Patch(':stepId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    type: BomOperationResDto,
    summary: 'Update a routing step (STT chạy/note)',
  })
  updateOperation(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
    @UUIDParam('stepId') stepId: string,
    @Body() reqDto: UpdateBomOperationReqDto,
  ): Promise<BomOperationResDto> {
    return this.bomOperationsService.updateBomOperation(
      itemId,
      bomItemId,
      stepId,
      reqDto,
    );
  }

  @Delete(':stepId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary: 'Delete a routing step ("[X]")',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteOperation(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
    @UUIDParam('stepId') stepId: string,
  ): Promise<void> {
    return this.bomOperationsService.deleteBomOperation(
      itemId,
      bomItemId,
      stepId,
    );
  }
}
