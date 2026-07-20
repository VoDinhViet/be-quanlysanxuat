import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialResDto } from './dto/material.res.dto';
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
}
