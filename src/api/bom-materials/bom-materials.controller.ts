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
import { BomMaterialsService } from './bom-materials.service';
import { BomMaterialResDto } from './dto/bom-material.res.dto';
import { CreateBomMaterialReqDto } from './dto/create-bom-material.req.dto';
import { GetBomMaterialsReqDto } from './dto/get-bom-materials.req.dto';
import { UpdateBomMaterialReqDto } from './dto/update-bom-material.req.dto';

@ApiTags('Boms')
@Controller('products/:productId/bom/items/:itemId/materials')
export class BomMaterialsController {
  constructor(private readonly bomMaterialsService: BomMaterialsService) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: BomMaterialResDto,
    summary: "List one BOM node's own materials (as-used, Thành phần vật tư)",
    isPaginated: true,
  })
  getMaterials(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @Query() reqDto: GetBomMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<BomMaterialResDto>> {
    return this.bomMaterialsService.getBomMaterials(productId, itemId, reqDto);
  }

  @Post()
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomMaterialResDto,
    summary: 'Add an as-used material line ("[+]") for this BOM node',
    statusCode: HttpStatus.CREATED,
  })
  addMaterial(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @Body() reqDto: CreateBomMaterialReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<BomMaterialResDto> {
    return this.bomMaterialsService.addBomMaterial(
      productId,
      itemId,
      reqDto,
      payload.userId,
    );
  }

  @Patch(':materialId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    type: BomMaterialResDto,
    summary: 'Edit an as-used material line (định mức/note/order)',
  })
  updateMaterial(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('materialId') materialId: string,
    @Body() reqDto: UpdateBomMaterialReqDto,
  ): Promise<BomMaterialResDto> {
    return this.bomMaterialsService.updateBomMaterial(
      productId,
      itemId,
      materialId,
      reqDto,
    );
  }

  @Delete(':materialId')
  @Permissions('products:bom-manage')
  @ApiAuth({
    summary: 'Delete an as-used material line ("[X]")',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteMaterial(
    @UUIDParam('productId') productId: string,
    @UUIDParam('itemId') itemId: string,
    @UUIDParam('materialId') materialId: string,
  ): Promise<void> {
    return this.bomMaterialsService.deleteBomMaterial(
      productId,
      itemId,
      materialId,
    );
  }
}
