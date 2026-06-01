import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { orderItems, orders, OrderStatus } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { OrdersService } from './orders.service';

type OrdersServiceDbMock = {
  query: {
    clients: { findFirst: jest.Mock; findMany: jest.Mock };
    orderFiles: { findFirst: jest.Mock };
    orders: { findFirst: jest.Mock; findMany: jest.Mock };
    products: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  insert: jest.Mock;
  select: jest.Mock;
  transaction: jest.Mock;
  update: jest.Mock;
};

describe('OrdersService', () => {
  let service: OrdersService;
  let db: OrdersServiceDbMock;

  beforeEach(async () => {
    db = {
      query: {
        clients: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        orderFiles: {
          findFirst: jest.fn(),
        },
        orders: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        products: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
      },
      insert: jest.fn(),
      select: jest.fn(),
      transaction: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it.each([
    [0, '1000.00', '0.00', '1000.00'],
    [5, '1000.00', '50.00', '1050.00'],
    [8, '1000.00', '80.00', '1080.00'],
    [10, '1000.00', '100.00', '1100.00'],
  ])('should calculate totals for VAT %s', (vatRate, subTotal, vatAmount, totalAfterVat) => {
    const serviceUnderTest = service as unknown as {
      calculateTotals: (
        items: Array<{ lineTotal: string }>,
        vatRate: number,
      ) => { subTotal: string; vatAmount: string; totalAfterVat: string };
    };

    expect(serviceUnderTest.calculateTotals([{ lineTotal: '1000.00' }], vatRate)).toEqual({
      subTotal,
      vatAmount,
      totalAfterVat,
    });
  });

  it('should create order with product snapshots and calculated totals', async () => {
    const orderId = '550e8400-e29b-41d4-a716-446655440001';
    const clientId = '550e8400-e29b-41d4-a716-446655440002';
    const productId = '550e8400-e29b-41d4-a716-446655440003';
    const userId = '550e8400-e29b-41d4-a716-446655440099';
    const createdAt = new Date('2024-05-01T00:00:00.000Z');
    const reqDto: CreateOrderReqDto = {
      clientId,
      code: 'PO-2401',
      prNumber: 'PR-2401',
      dueDate: new Date('2024-05-20T00:00:00.000Z'),
      vatRate: 10,
      items: [{ productId, quantity: 2 }],
    };
    const orderEntity = makeOrderEntity({ id: orderId, clientId, productId, createdAt });
    const orderInsertValues = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id: orderId }]),
    });
    const itemInsertValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      insert: jest.fn((table: unknown) => {
        if (table === orders) {
          return { values: orderInsertValues };
        }

        if (table === orderItems) {
          return { values: itemInsertValues };
        }

        throw new Error('Unexpected table');
      }),
    };

    db.query.orders.findFirst.mockResolvedValueOnce(undefined);
    db.query.clients.findFirst.mockResolvedValue({ id: clientId });
    db.query.products.findMany.mockResolvedValue([
      {
        id: productId,
        code: 'XYZ',
        name: 'Khung sat',
        defaultSalePrice: '125.50',
        unit: { code: 'bo', name: 'Bộ' },
      },
    ]);
    db.transaction.mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    db.query.orders.findFirst.mockResolvedValueOnce(orderEntity);

    const result = await service.createOrder(reqDto, userId);

    expect(result.id).toBe(orderId);
    expect(orderInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        subTotal: '251.00',
        vatAmount: '25.10',
        totalAfterVat: '276.10',
        status: OrderStatus.PendingApproval,
      }),
    );
    expect(itemInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        productCode: 'XYZ',
        productName: 'Khung sat',
        unit: 'bo',
        quantity: '2.000',
        unitPrice: '125.50',
        lineTotal: '251.00',
      }),
    ]);
  });

  it('should reject update and delete for approved orders', async () => {
    const order = makeOrderEntity({ status: OrderStatus.Approved });
    db.query.orders.findFirst.mockResolvedValue(order);

    await expect(service.updateOrder(order.id, { note: 'Change' }, 'user-id')).rejects.toThrow(
      AppException,
    );
    await expect(service.deleteOrder(order.id, 'user-id')).rejects.toThrow(AppException);
  });

  it('should allow approve and reject only for pending approval orders', async () => {
    const approvedOrder = makeOrderEntity({ status: OrderStatus.Approved });
    db.query.orders.findFirst.mockResolvedValue(approvedOrder);

    await expect(service.approveOrder(approvedOrder.id, 'user-id')).rejects.toThrow(AppException);
    await expect(
      service.rejectOrder(approvedOrder.id, { rejectedReason: 'Need review' }, 'user-id'),
    ).rejects.toThrow(AppException);
  });

  it('should omit financial fields and PO PDF metadata from production response', () => {
    const order = makeOrderEntity({ status: OrderStatus.Approved });
    const serviceUnderTest = service as unknown as {
      mapProductionOrder: (entity: ReturnType<typeof makeOrderEntity>) => Record<string, unknown>;
    };

    const result = serviceUnderTest.mapProductionOrder(order);

    expect(result).not.toHaveProperty('subTotal');
    expect(result).not.toHaveProperty('vatAmount');
    expect(result).not.toHaveProperty('totalAfterVat');
    expect(result).not.toHaveProperty('files');
    expect(result.items[0]).not.toHaveProperty('unitPrice');
    expect(result.items[0]).not.toHaveProperty('lineTotal');
  });

  it('should reject non-PDF order uploads', () => {
    const serviceUnderTest = service as unknown as {
      ensureUploadedOrderPdfAllowed: (file: {
        originalname: string;
        mimetype: string;
        size: number;
        path: string;
      }) => unknown;
    };

    expect(() =>
      serviceUnderTest.ensureUploadedOrderPdfAllowed({
        originalname: 'po.txt',
        mimetype: 'text/plain',
        size: 1024,
        path: '/tmp/po.txt',
      }),
    ).toThrow(AppException);
  });
});

type OrderEntityOverrides = Partial<{
  id: string;
  clientId: string;
  productId: string;
  createdAt: Date;
  status: OrderStatus;
}>;

function makeOrderEntity(overrides: OrderEntityOverrides = {}) {
  const now = new Date('2024-05-01T00:00:00.000Z');
  const orderId = overrides.id ?? '550e8400-e29b-41d4-a716-446655440001';
  const clientId = overrides.clientId ?? '550e8400-e29b-41d4-a716-446655440002';
  const productId = overrides.productId ?? '550e8400-e29b-41d4-a716-446655440003';
  const createdAt = overrides.createdAt ?? now;

  return {
    id: orderId,
    clientId,
    code: 'PO-2401',
    prNumber: 'PR-2401',
    dueDate: '2024-05-20',
    note: null,
    vatRate: 10,
    subTotal: '251.00',
    vatAmount: '25.10',
    totalAfterVat: '276.10',
    status: OrderStatus.PendingApproval,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    createdBy: '550e8400-e29b-41d4-a716-446655440099',
    updatedBy: '550e8400-e29b-41d4-a716-446655440099',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    client: {
      id: clientId,
      code: 'KH0001',
      fullName: 'Nike Size',
      email: null,
      phoneNumber: '0900000000',
      clientType: 'COMPANY',
      taxCode: '0100000000',
      companyName: 'Nike Size',
      address: 'HCM',
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    },
    items: [
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        orderId,
        productId,
        productCode: 'XYZ',
        productName: 'Khung sat',
        unit: 'bo',
        quantity: '2.000',
        unitPrice: '125.50',
        lineTotal: '251.00',
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
        product: {
          id: productId,
          clientId,
          code: 'XYZ',
          name: 'Khung sat',
          itemType: 'fg',
          unitId: '550e8400-e29b-41d4-a716-446655440005',
          imageUrl: '/uploads/products/xyz.png',
          defaultSalePrice: '125.50',
          status: 'active',
          note: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
          files: [],
        },
      },
    ],
    files: [
      {
        id: '550e8400-e29b-41d4-a716-446655440006',
        orderId,
        fileType: 'order_pdf',
        originalName: 'po.pdf',
        fileName: 'po.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        filePath: 'uploads/orders/pdfs/po.pdf',
        uploadedBy: '550e8400-e29b-41d4-a716-446655440099',
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      },
    ],
    ...overrides,
  };
}
