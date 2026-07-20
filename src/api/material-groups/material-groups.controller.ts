import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { MaterialGroupResDto } from './dto/material-group.res.dto';
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
}
