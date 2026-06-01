import { Test, TestingModule } from '@nestjs/testing';

import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<
    Pick<
      OrdersService,
      | 'approveOrder'
      | 'createOrder'
      | 'deleteOrder'
      | 'deleteOrderFile'
      | 'getOrderDetail'
      | 'getOrders'
      | 'getProductOptions'
      | 'getProductionOrderDetail'
      | 'getProductionOrders'
      | 'rejectOrder'
      | 'updateOrder'
      | 'uploadOrderPdf'
    >
  >;

  beforeEach(async () => {
    ordersService = {
      approveOrder: jest.fn(),
      createOrder: jest.fn(),
      deleteOrder: jest.fn(),
      deleteOrderFile: jest.fn(),
      getOrderDetail: jest.fn(),
      getOrders: jest.fn(),
      getProductOptions: jest.fn(),
      getProductionOrderDetail: jest.fn(),
      getProductionOrders: jest.fn(),
      rejectOrder: jest.fn(),
      updateOrder: jest.fn(),
      uploadOrderPdf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: ordersService,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate commercial order list queries to service', async () => {
    const reqDto = { limit: 10, page: 1, offset: 0 } as never;
    const response = { data: [], pagination: { totalRecords: 0 } } as never;
    ordersService.getOrders.mockResolvedValue(response);

    await expect(controller.getOrders(reqDto)).resolves.toBe(response);

    expect(ordersService.getOrders).toHaveBeenCalledWith(reqDto);
  });

  it('should delegate order creation to service with user id', async () => {
    const reqDto = {
      clientId: '550e8400-e29b-41d4-a716-446655440001',
      code: 'PO-2401',
      prNumber: 'PR-2401',
      dueDate: new Date('2024-05-20T00:00:00.000Z'),
      vatRate: 10,
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440002',
          quantity: 2,
        },
      ],
    } as CreateOrderReqDto;
    const user = { sub: '550e8400-e29b-41d4-a716-446655440099' };
    const response = { id: '550e8400-e29b-41d4-a716-446655440003' } as never;
    ordersService.createOrder.mockResolvedValue(response);

    await expect(controller.createOrder(reqDto, user)).resolves.toBe(response);

    expect(ordersService.createOrder).toHaveBeenCalledWith(reqDto, user.sub);
  });

  it('should delegate approve and reject actions to service', async () => {
    const orderId = '550e8400-e29b-41d4-a716-446655440001';
    const user = { sub: '550e8400-e29b-41d4-a716-446655440099' };
    const response = { id: orderId } as never;
    ordersService.approveOrder.mockResolvedValue(response);
    ordersService.rejectOrder.mockResolvedValue(response);

    await expect(controller.approveOrder(orderId, user)).resolves.toBe(response);
    await expect(
      controller.rejectOrder(orderId, { rejectedReason: 'Missing price confirmation' }, user),
    ).resolves.toBe(response);

    expect(ordersService.approveOrder).toHaveBeenCalledWith(orderId, user.sub);
    expect(ordersService.rejectOrder).toHaveBeenCalledWith(
      orderId,
      { rejectedReason: 'Missing price confirmation' },
      user.sub,
    );
  });

  it('should delegate production-safe views to service', async () => {
    const reqDto = { limit: 10, page: 1, offset: 0 } as never;
    const orderId = '550e8400-e29b-41d4-a716-446655440001';
    const listResponse = { data: [], pagination: { totalRecords: 0 } } as never;
    const detailResponse = { id: orderId } as never;
    ordersService.getProductionOrders.mockResolvedValue(listResponse);
    ordersService.getProductionOrderDetail.mockResolvedValue(detailResponse);

    await expect(controller.getProductionOrders(reqDto)).resolves.toBe(listResponse);
    await expect(controller.getProductionOrderDetail(orderId)).resolves.toBe(detailResponse);

    expect(ordersService.getProductionOrders).toHaveBeenCalledWith(reqDto);
    expect(ordersService.getProductionOrderDetail).toHaveBeenCalledWith(orderId);
  });

  it('should delegate file upload and file delete to service', async () => {
    const orderId = '550e8400-e29b-41d4-a716-446655440001';
    const fileId = '550e8400-e29b-41d4-a716-446655440002';
    const user = { sub: '550e8400-e29b-41d4-a716-446655440099' };
    const storedFile = {
      originalname: 'po.pdf',
      filename: 'upload-temp',
      mimetype: 'application/pdf',
      size: 1024,
      path: '/tmp/upload-temp',
    };
    const response = { id: fileId } as never;
    ordersService.uploadOrderPdf.mockResolvedValue(response);
    ordersService.deleteOrderFile.mockResolvedValue(response);

    await expect(controller.uploadOrderPdf(orderId, storedFile, user)).resolves.toBe(response);
    await expect(controller.deleteOrderFile(orderId, fileId, user)).resolves.toBe(response);

    expect(ordersService.uploadOrderPdf).toHaveBeenCalledWith(orderId, storedFile, user.sub);
    expect(ordersService.deleteOrderFile).toHaveBeenCalledWith(orderId, fileId, user.sub);
  });
});
