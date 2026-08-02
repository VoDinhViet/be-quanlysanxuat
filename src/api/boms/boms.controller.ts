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
import { BomItemNodeResDto } from './dto/bom-item-node.res.dto';
import { BomItemResDto } from './dto/bom-item.res.dto';
import { BomMaterialResDto } from './dto/bom-material.res.dto';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { GetBomMaterialsReqDto } from './dto/get-bom-materials.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';
import { BomsService } from './boms.service';

@ApiTags('Boms')
@Controller('products/:productId/bom')
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: BomItemResDto,
    summary: "Get a product's BOM tree (Cấu trúc sản phẩm)",
    isArray: true,
  })
  getBom(@UUIDParam('productId') productId: string): Promise<BomItemResDto[]> {
    return this.bomsService.getBomTree(productId);
  }

  @Get('materials')
  @Permissions('products:read')
  @ApiPublic({
    type: BomMaterialResDto,
    summary:
      "List a BOM's materials (mọi cấp), aggregated per material (gộp theo vật tư)",
    isPaginated: true,
  })
  getBomMaterials(
    @UUIDParam('productId') productId: string,
    @Query() reqDto: GetBomMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<BomMaterialResDto>> {
    return this.bomsService.getBomMaterials(productId, reqDto);
  }

  @Post('items')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomItemNodeResDto,
    summary:
      'Add a BOM node ("[+]") as a child of parentId, or top-level if omitted',
    statusCode: HttpStatus.CREATED,
  })
  addItem(
    @UUIDParam('productId') productId: string,
    @Body() reqDto: CreateBomItemReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<BomItemNodeResDto> {
    return this.bomsService.addBomItem(productId, reqDto, payload.userId);
  }

  @Patch('items/:itemId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomItemNodeResDto,
    summary: 'Edit a BOM node (inline SL/note/order)',
  })
  updateItem(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: UpdateBomItemReqDto,
  ): Promise<BomItemNodeResDto> {
    return this.bomsService.updateBomItem(productId, itemId, reqDto);
  }

  @Delete('items/:itemId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    summary: 'Delete a BOM node ("[X]") and its subtree',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteItem(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
  ): Promise<void> {
    return this.bomsService.deleteBomItem(productId, itemId);
  }
}
