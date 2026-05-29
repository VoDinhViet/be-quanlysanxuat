import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
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
  @Permissions('clients:manage')
  @ApiAuth({
    type: ClientResDto,
    summary: 'List clients',
    isPaginated: true,
  })
  getClients(@Query() reqDto: GetClientsReqDto): Promise<OffsetPaginatedDto<ClientResDto>> {
    return this.clientsService.getClients(reqDto);
  }

  @Post()
  @Permissions('clients:manage')
  @ApiAuth({
    type: ClientResDto,
    summary: 'Create client',
    statusCode: HttpStatus.CREATED,
  })
  createClient(@Body() reqDto: CreateClientReqDto): Promise<ClientResDto> {
    return this.clientsService.createClient(reqDto);
  }

  @Patch(':clientId')
  @Permissions('clients:manage')
  @ApiAuth({
    type: ClientResDto,
    summary: 'Update client',
  })
  updateClient(
    @UUIDParam('clientId') clientId: string,
    @Body() reqDto: UpdateClientReqDto,
  ): Promise<ClientResDto> {
    return this.clientsService.updateClient(clientId, reqDto);
  }

  @Delete(':clientId')
  @Permissions('clients:manage')
  @ApiAuth({
    type: ClientResDto,
    summary: 'Delete client',
  })
  deleteClient(@UUIDParam('clientId') clientId: string): Promise<ClientResDto> {
    return this.clientsService.deleteClient(clientId);
  }
}
