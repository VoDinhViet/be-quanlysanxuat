import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateOperationReqDto } from './dto/create-operation.req.dto';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { UpdateOperationReqDto } from './dto/update-operation.req.dto';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

describe('OperationsController', () => {
  let controller: OperationsController;
  let mockService: {
    getOperations: jest.Mock;
    getOperationDetail: jest.Mock;
    createOperation: jest.Mock;
    updateOperation: jest.Mock;
    deleteOperation: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getOperations: jest.fn(),
      getOperationDetail: jest.fn(),
      createOperation: jest.fn(),
      updateOperation: jest.fn(),
      deleteOperation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [{ provide: OperationsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OperationsController>(OperationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOperations delegates to OperationsService.getOperations', async () => {
    const reqDto = new GetOperationsReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getOperations.mockResolvedValue(expected);

    const result = await controller.getOperations(reqDto);

    expect(mockService.getOperations).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getOperationDetail delegates to OperationsService.getOperationDetail', async () => {
    const expected = { id: 'op1' };
    mockService.getOperationDetail.mockResolvedValue(expected);

    const result = await controller.getOperationDetail('op1');

    expect(mockService.getOperationDetail).toHaveBeenCalledWith('op1');
    expect(result).toBe(expected);
  });

  it('createOperation delegates to OperationsService.createOperation with the current user id', async () => {
    const reqDto = new CreateOperationReqDto();
    const expected = { id: 'op1' };
    mockService.createOperation.mockResolvedValue(expected);

    const result = await controller.createOperation(reqDto, payload);

    expect(mockService.createOperation).toHaveBeenCalledWith(reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateOperation delegates to OperationsService.updateOperation', async () => {
    const reqDto = new UpdateOperationReqDto();
    const expected = { id: 'op1' };
    mockService.updateOperation.mockResolvedValue(expected);

    const result = await controller.updateOperation('op1', reqDto);

    expect(mockService.updateOperation).toHaveBeenCalledWith('op1', reqDto);
    expect(result).toBe(expected);
  });

  it('deleteOperation delegates to OperationsService.deleteOperation', async () => {
    mockService.deleteOperation.mockResolvedValue(undefined);

    const result = await controller.deleteOperation('op1');

    expect(mockService.deleteOperation).toHaveBeenCalledWith('op1');
    expect(result).toBeUndefined();
  });
});
