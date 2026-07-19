import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateMaterialGroupReqDto } from './dto/create-material-group.req.dto';
import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { MaterialGroupResDto } from './dto/material-group.res.dto';
import { UpdateMaterialGroupReqDto } from './dto/update-material-group.req.dto';
import { MaterialGroupsService } from './material-groups.service';

@ApiTags('Material Groups')
@Controller('material-groups')
export class MaterialGroupsController {
  constructor(private readonly materialGroupsService: MaterialGroupsService) {}

  @Get()
  @Permissions('materials:read')
  @ApiAuth({
    type: MaterialGroupResDto,
    summary: 'List material groups',
    isPaginated: true,
  })
  getMaterialGroups(
    @Query() reqDto: GetMaterialGroupsReqDto,
  ): Promise<OffsetPaginatedDto<MaterialGroupResDto>> {
    return this.materialGroupsService.getMaterialGroups(reqDto);
  }

  @Get(':id')
  @Permissions('materials:read')
  @ApiAuth({
    type: MaterialGroupResDto,
    summary: 'Get material group detail',
  })
  getMaterialGroupDetail(@UUIDParam('id') id: string): Promise<MaterialGroupResDto> {
    return this.materialGroupsService.getMaterialGroupDetail(id);
  }

  @Post()
  @Permissions('materials:create')
  @ApiAuth({
    type: MaterialGroupResDto,
    summary: 'Create material group',
    statusCode: HttpStatus.CREATED,
  })
  createMaterialGroup(@Body() reqDto: CreateMaterialGroupReqDto): Promise<MaterialGroupResDto> {
    return this.materialGroupsService.createMaterialGroup(reqDto);
  }

  @Patch(':id')
  @Permissions('materials:update')
  @ApiAuth({
    type: MaterialGroupResDto,
    summary: 'Update material group',
  })
  updateMaterialGroup(
    @UUIDParam('id') id: string,
    @Body() reqDto: UpdateMaterialGroupReqDto,
  ): Promise<MaterialGroupResDto> {
    return this.materialGroupsService.updateMaterialGroup(id, reqDto);
  }

  @Delete(':id')
  @Permissions('materials:delete')
  @ApiAuth({
    summary: 'Delete material group (blocked if used by any material)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteMaterialGroup(@UUIDParam('id') id: string): Promise<void> {
    return this.materialGroupsService.deleteMaterialGroup(id);
  }
}
