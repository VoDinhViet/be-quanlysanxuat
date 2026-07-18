import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { CreateClientReqDto } from './dto/create-client.req.dto';
import { GetClientsReqDto } from './dto/get-clients.req.dto';
import { UpdateClientReqDto } from './dto/update-client.req.dto';

describe('ClientsController', () => {
  let controller: ClientsController;
  let mockService: {
    getClients: jest.Mock;
    getClientDetail: jest.Mock;
    createClient: jest.Mock;
    updateClient: jest.Mock;
    deleteClient: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getClients: jest.fn(),
      getClientDetail: jest.fn(),
      createClient: jest.fn(),
      updateClient: jest.fn(),
      deleteClient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [{ provide: ClientsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClientsController>(ClientsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getClients delegates to ClientsService.getClients', async () => {
    const reqDto = new GetClientsReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getClients.mockResolvedValue(expected);

    const result = await controller.getClients(reqDto);

    expect(mockService.getClients).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getClientDetail delegates to ClientsService.getClientDetail', async () => {
    const expected = { id: 'c1' };
    mockService.getClientDetail.mockResolvedValue(expected);

    const result = await controller.getClientDetail('c1');

    expect(mockService.getClientDetail).toHaveBeenCalledWith('c1');
    expect(result).toBe(expected);
  });

  it('createClient delegates to ClientsService.createClient with the current user id', async () => {
    const reqDto = new CreateClientReqDto();
    const expected = { id: 'c1' };
    mockService.createClient.mockResolvedValue(expected);

    const result = await controller.createClient(reqDto, payload);

    expect(mockService.createClient).toHaveBeenCalledWith(reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateClient delegates to ClientsService.updateClient', async () => {
    const reqDto = new UpdateClientReqDto();
    const expected = { id: 'c1' };
    mockService.updateClient.mockResolvedValue(expected);

    const result = await controller.updateClient('c1', reqDto);

    expect(mockService.updateClient).toHaveBeenCalledWith('c1', reqDto);
    expect(result).toBe(expected);
  });

  it('deleteClient delegates to ClientsService.deleteClient', async () => {
    mockService.deleteClient.mockResolvedValue(undefined);

    const result = await controller.deleteClient('c1');

    expect(mockService.deleteClient).toHaveBeenCalledWith('c1');
    expect(result).toBeUndefined();
  });
});
