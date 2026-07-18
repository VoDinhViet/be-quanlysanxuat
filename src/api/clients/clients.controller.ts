import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { ClientsService } from './clients.service';
import { ClientResDto } from './dto/client.res.dto';
import { CreateClientReqDto } from './dto/create-client.req.dto';
import { GetClientsReqDto } from './dto/get-clients.req.dto';
import { UpdateClientReqDto } from './dto/update-client.req.dto';

@ApiTags('Clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Permissions('clients:read')
  @ApiPublic({
    type: ClientResDto,
    summary: 'List clients',
    isPaginated: true,
  })
  getClients(@Query() reqDto: GetClientsReqDto): Promise<OffsetPaginatedDto<ClientResDto>> {
    return this.clientsService.getClients(reqDto);
  }

  @Get(':id')
  @Permissions('clients:read')
  @ApiPublic({
    type: ClientResDto,
    summary: 'Get client detail',
  })
  getClientDetail(@UUIDParam('id') id: string): Promise<ClientResDto> {
    return this.clientsService.getClientDetail(id);
  }

  @Post()
  @Permissions('clients:create')
  @ApiAuth({
    type: ClientResDto,
    summary: 'Create client',
    statusCode: HttpStatus.CREATED,
  })
  createClient(
    @Body() reqDto: CreateClientReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ClientResDto> {
    return this.clientsService.createClient(reqDto, payload.sub);
  }

  @Patch(':id')
  @Permissions('clients:update')
  @ApiAuth({
    type: ClientResDto,
    summary: 'Update client',
  })
  updateClient(
    @UUIDParam('id') id: string,
    @Body() reqDto: UpdateClientReqDto,
  ): Promise<ClientResDto> {
    return this.clientsService.updateClient(id, reqDto);
  }

  @Delete(':id')
  @Permissions('clients:delete')
  @ApiAuth({
    summary: 'Delete client (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteClient(@UUIDParam('id') id: string): Promise<void> {
    return this.clientsService.deleteClient(id);
  }
}
