import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiPublic } from '../../decorators/http.decorators';
import { ClientGroupsService } from './client-groups.service';
import { ClientGroupResDto } from './dto/client-group.res.dto';
import { GetClientGroupsReqDto } from './dto/get-client-groups.req.dto';

@ApiTags('Client Groups')
@Controller('client-groups')
export class ClientGroupsController {
  constructor(private readonly clientGroupsService: ClientGroupsService) {}

  @Get()
  @ApiPublic({
    type: ClientGroupResDto,
    summary: 'List client groups',
    isPaginated: true,
  })
  getClientGroups(
    @Query() reqDto: GetClientGroupsReqDto,
  ): Promise<OffsetPaginatedDto<ClientGroupResDto>> {
    return this.clientGroupsService.getClientGroups(reqDto);
  }
}
