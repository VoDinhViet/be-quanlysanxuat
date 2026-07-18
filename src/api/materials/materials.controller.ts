import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PageOptionsDto } from '../../common/dto/offset-pagination/page-options.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialLogResDto } from './dto/material-log.res.dto';
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
  getMaterials(@Query() reqDto: GetMaterialsReqDto): Promise<OffsetPaginatedDto<MaterialResDto>> {
    return this.materialsService.getMaterials(reqDto);
  }

  @Get(':id')
  @Permissions('materials:read')
  @ApiAuth({
    type: MaterialResDto,
    summary: 'Get material detail',
  })
  getMaterialDetail(@UUIDParam('id') id: string): Promise<MaterialResDto> {
    return this.materialsService.getMaterialDetail(id);
  }

  @Get(':id/logs')
  @Permissions('materials:read')
  @ApiAuth({
    type: MaterialLogResDto,
    summary: 'Get material change history',
    isPaginated: true,
  })
  getMaterialLogs(
    @UUIDParam('id') id: string,
    @Query() reqDto: PageOptionsDto,
  ): Promise<OffsetPaginatedDto<MaterialLogResDto>> {
    return this.materialsService.getMaterialLogs(id, reqDto);
  }

  @Post()
  @Permissions('materials:create')
  @ApiAuth({
    type: MaterialResDto,
    summary: 'Create material',
    statusCode: HttpStatus.CREATED,
  })
  createMaterial(
    @Body() reqDto: CreateMaterialReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<MaterialResDto> {
    return this.materialsService.createMaterial(reqDto, payload.sub);
  }

  @Patch(':id')
  @Permissions('materials:update')
  @ApiAuth({
    type: MaterialResDto,
    summary: 'Update material (code is immutable; set status INACTIVE to deactivate)',
  })
  updateMaterial(
    @UUIDParam('id') id: string,
    @Body() reqDto: UpdateMaterialReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<MaterialResDto> {
    return this.materialsService.updateMaterial(id, reqDto, payload.sub);
  }

  @Delete(':id')
  @Permissions('materials:delete')
  @ApiAuth({
    summary: 'Delete material (hard delete; only when it has no transactions)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteMaterial(@UUIDParam('id') id: string): Promise<void> {
    return this.materialsService.deleteMaterial(id);
  }
}
