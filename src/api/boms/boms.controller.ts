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
import { BomItemResDto } from './dto/bom-item.res.dto';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';
import { BomsService } from './boms.service';

@ApiTags('Boms')
@Controller('items/:itemId/bom')
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get()
  @Permissions('items:read')
  @ApiAuth({
    type: BomItemResDto,
    summary: "Get an item's BOM structure tree (Cấu trúc sản phẩm)",
    isArray: true,
  })
  getBom(@UUIDParam('itemId') itemId: string): Promise<BomItemResDto[]> {
    return this.bomsService.getBom(itemId);
  }

  @Post('items')
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary:
      'Create a BOM node ("[+]") as a child of parentId, or top-level if omitted',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createItem(
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: CreateBomItemReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.bomsService.createBomItem(itemId, reqDto, payload.userId);
  }

  @Patch('items/:bomItemId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary: 'Update a BOM node (inline SL/note/order)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateItem(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
    @Body() reqDto: UpdateBomItemReqDto,
  ): Promise<void> {
    return this.bomsService.updateBomItem(itemId, bomItemId, reqDto);
  }

  @Delete('items/:bomItemId')
  @Permissions('items:bom-manage')
  @ApiAuth({
    summary: 'Delete a BOM node ("[X]") and its subtree',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteItem(
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('bomItemId') bomItemId: string,
  ): Promise<void> {
    return this.bomsService.deleteBomItem(itemId, bomItemId);
  }
}
