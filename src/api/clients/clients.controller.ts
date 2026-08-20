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
import { ClientsService } from './clients.service';
import { ClientContactResDto } from './dto/client-contact.res.dto';
import { ClientOptionResDto } from './dto/client-option.res.dto';
import { ClientResDto } from './dto/client.res.dto';
import { CreateClientReqDto } from './dto/create-client.req.dto';
import { GetClientOptionsReqDto } from './dto/get-client-options.req.dto';
import { GetClientsReqDto } from './dto/get-clients.req.dto';
import { PageClientResDto } from './dto/page-client.res.dto';
import { UpdateClientReqDto } from './dto/update-client.req.dto';

@ApiTags('Clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Permissions('clients:read')
  @ApiPublic({
    type: PageClientResDto,
    summary: 'List clients',
    isPaginated: true,
  })
  getClients(
    @Query() reqDto: GetClientsReqDto,
  ): Promise<OffsetPaginatedDto<PageClientResDto>> {
    return this.clientsService.getClients(reqDto);
  }

  @Get('options')
  @Permissions('clients:read')
  @ApiPublic({
    type: ClientOptionResDto,
    summary: 'List clients for dropdown',
    isArray: true,
  })
  getClientOptions(
    @Query() reqDto: GetClientOptionsReqDto,
  ): Promise<ClientOptionResDto[]> {
    return this.clientsService.getClientOptions(reqDto);
  }

  @Get(':clientId')
  @Permissions('clients:read')
  @ApiPublic({
    type: ClientResDto,
    summary: 'Get client detail',
  })
  getClient(@UUIDParam('clientId') clientId: string): Promise<ClientResDto> {
    return this.clientsService.getClient(clientId);
  }

  @Get(':clientId/contacts')
  @Permissions('clients:read')
  @ApiPublic({
    type: ClientContactResDto,
    summary: 'List contacts for a client',
    isArray: true,
  })
  getClientContacts(
    @UUIDParam('clientId') clientId: string,
  ): Promise<ClientContactResDto[]> {
    return this.clientsService.getClientContacts(clientId);
  }

  @Post()
  @Permissions('clients:create')
  @ApiAuth({
    summary: 'Create client',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createClient(
    @Body() reqDto: CreateClientReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.clientsService.createClient(reqDto, payload.userId);
  }

  @Patch(':clientId')
  @Permissions('clients:update')
  @ApiAuth({
    summary: 'Update client',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateClient(
    @UUIDParam('clientId') clientId: string,
    @Body() reqDto: UpdateClientReqDto,
  ): Promise<void> {
    return this.clientsService.updateClient(clientId, reqDto);
  }

  @Delete(':clientId')
  @Permissions('clients:delete')
  @ApiAuth({
    summary: 'Delete client (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteClient(@UUIDParam('clientId') clientId: string): Promise<void> {
    return this.clientsService.deleteClient(clientId);
  }
}
