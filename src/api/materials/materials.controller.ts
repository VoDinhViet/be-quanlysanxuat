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

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialResDto } from './dto/material.res.dto';
import { UpdateMaterialReqDto } from './dto/update-material.req.dto';
import { MaterialsService } from './materials.service';

@ApiTags('Materials')
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  @Permissions('materials:read')
  @ApiAuth({
    type: MaterialResDto,
    summary: 'List materials',
    isPaginated: true,
  })
  getMaterials(
    @Query() reqDto: GetMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<MaterialResDto>> {
    return this.materialsService.getMaterials(reqDto);
  }

  @Get(':materialId')
  @Permissions('materials:read')
  @ApiAuth({
    type: MaterialResDto,
    summary: 'Get material detail',
  })
  getMaterialDetail(
    @UUIDParam('materialId') materialId: string,
  ): Promise<MaterialResDto> {
    return this.materialsService.getMaterialDetail(materialId);
  }

  @Post()
  @Permissions('materials:create')
  @ApiAuth({
    type: MaterialResDto,
    summary: 'Create a material',
    statusCode: HttpStatus.CREATED,
  })
  createMaterial(
    @Body() reqDto: CreateMaterialReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<MaterialResDto> {
    return this.materialsService.createMaterial(reqDto, payload.sub);
  }

  @Patch(':materialId')
  @Permissions('materials:update')
  @ApiAuth({
    type: MaterialResDto,
    summary: 'Update a material',
  })
  updateMaterial(
    @UUIDParam('materialId') materialId: string,
    @Body() reqDto: UpdateMaterialReqDto,
  ): Promise<MaterialResDto> {
    return this.materialsService.updateMaterial(materialId, reqDto);
  }

  @Delete(':materialId')
  @Permissions('materials:delete')
  @ApiAuth({
    summary: 'Delete a material (hard delete; blocked if used in a BOM)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteMaterial(@UUIDParam('materialId') materialId: string): Promise<void> {
    return this.materialsService.deleteMaterial(materialId);
  }
}
