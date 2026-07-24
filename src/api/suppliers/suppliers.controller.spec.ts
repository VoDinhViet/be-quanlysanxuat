import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateSupplierReqDto } from './dto/create-supplier.req.dto';
import { GetSuppliersReqDto } from './dto/get-suppliers.req.dto';
import { UpdateSupplierReqDto } from './dto/update-supplier.req.dto';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

describe('SuppliersController', () => {
  let controller: SuppliersController;
  let mockService: {
    getSuppliers: jest.Mock;
    getSupplierStats: jest.Mock;
    getSupplierDetail: jest.Mock;
    createSupplier: jest.Mock;
    updateSupplier: jest.Mock;
    deleteSupplier: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getSuppliers: jest.fn(),
      getSupplierStats: jest.fn(),
      getSupplierDetail: jest.fn(),
      createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
      deleteSupplier: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [{ provide: SuppliersService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SuppliersController>(SuppliersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getSuppliers delegates to SuppliersService.getSuppliers', async () => {
    const reqDto = new GetSuppliersReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getSuppliers.mockResolvedValue(expected);

    const result = await controller.getSuppliers(reqDto);

    expect(mockService.getSuppliers).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getSupplierStats delegates to SuppliersService.getSupplierStats', async () => {
    const expected = { total: 0, active: 0, paused: 0, stopped: 0 };
    mockService.getSupplierStats.mockResolvedValue(expected);

    const result = await controller.getSupplierStats();

    expect(mockService.getSupplierStats).toHaveBeenCalled();
    expect(result).toBe(expected);
  });

  it('getSupplierDetail delegates to SuppliersService.getSupplierDetail', async () => {
    const expected = { id: 's1' };
    mockService.getSupplierDetail.mockResolvedValue(expected);

    const result = await controller.getSupplierDetail('s1');

    expect(mockService.getSupplierDetail).toHaveBeenCalledWith('s1');
    expect(result).toBe(expected);
  });

  it('createSupplier delegates to SuppliersService.createSupplier with the current user id', async () => {
    const reqDto = new CreateSupplierReqDto();
    const expected = { id: 's1' };
    mockService.createSupplier.mockResolvedValue(expected);

    const result = await controller.createSupplier(reqDto, payload);

    expect(mockService.createSupplier).toHaveBeenCalledWith(
      reqDto,
      payload.sub,
    );
    expect(result).toBe(expected);
  });

  it('updateSupplier delegates to SuppliersService.updateSupplier', async () => {
    const reqDto = new UpdateSupplierReqDto();
    const expected = { id: 's1' };
    mockService.updateSupplier.mockResolvedValue(expected);

    const result = await controller.updateSupplier('s1', reqDto);

    expect(mockService.updateSupplier).toHaveBeenCalledWith('s1', reqDto);
    expect(result).toBe(expected);
  });

  it('deleteSupplier delegates to SuppliersService.deleteSupplier', async () => {
    mockService.deleteSupplier.mockResolvedValue(undefined);

    const result = await controller.deleteSupplier('s1');

    expect(mockService.deleteSupplier).toHaveBeenCalledWith('s1');
    expect(result).toBeUndefined();
  });
});
