import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let mockService: {
    getOrders: jest.Mock;
    getOrderStats: jest.Mock;
    getOrderDetail: jest.Mock;
    createOrder: jest.Mock;
    updateOrder: jest.Mock;
    deleteOrder: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getOrders: jest.fn(),
      getOrderStats: jest.fn(),
      getOrderDetail: jest.fn(),
      createOrder: jest.fn(),
      updateOrder: jest.fn(),
      deleteOrder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOrders delegates to OrdersService.getOrders', async () => {
    const reqDto = new GetOrdersReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getOrders.mockResolvedValue(expected);

    const result = await controller.getOrders(reqDto);

    expect(mockService.getOrders).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getOrderStats delegates to OrdersService.getOrderStats', async () => {
    const expected = { totalOrders: 0, totalValue: 0 };
    mockService.getOrderStats.mockResolvedValue(expected);

    const result = await controller.getOrderStats();

    expect(mockService.getOrderStats).toHaveBeenCalled();
    expect(result).toBe(expected);
  });

  it('getOrderDetail delegates to OrdersService.getOrderDetail', async () => {
    const expected = { id: 'o1' };
    mockService.getOrderDetail.mockResolvedValue(expected);

    const result = await controller.getOrderDetail('o1');

    expect(mockService.getOrderDetail).toHaveBeenCalledWith('o1');
    expect(result).toBe(expected);
  });

  it('createOrder delegates to OrdersService.createOrder with the current user id', async () => {
    const reqDto = new CreateOrderReqDto();
    const expected = { id: 'o1' };
    mockService.createOrder.mockResolvedValue(expected);

    const result = await controller.createOrder(reqDto, payload);

    expect(mockService.createOrder).toHaveBeenCalledWith(reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateOrder delegates to OrdersService.updateOrder', async () => {
    const reqDto = new UpdateOrderReqDto();
    const expected = { id: 'o1' };
    mockService.updateOrder.mockResolvedValue(expected);

    const result = await controller.updateOrder('o1', reqDto);

    expect(mockService.updateOrder).toHaveBeenCalledWith('o1', reqDto);
    expect(result).toBe(expected);
  });

  it('deleteOrder delegates to OrdersService.deleteOrder', async () => {
    mockService.deleteOrder.mockResolvedValue(undefined);

    const result = await controller.deleteOrder('o1');

    expect(mockService.deleteOrder).toHaveBeenCalledWith('o1');
    expect(result).toBeUndefined();
  });
});
