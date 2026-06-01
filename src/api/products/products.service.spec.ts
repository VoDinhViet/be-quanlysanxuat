import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let db: jest.Mocked<Pick<Database, 'query'>>;

  beforeEach(async () => {
    db = {
      query: {
        operations: {
          findMany: jest.fn(),
        },
        productTypes: {
          findMany: jest.fn(),
        },
        products: {
          findMany: jest.fn(),
        },
        units: {
          findMany: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<Pick<Database, 'query'>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should map product options', async () => {
    db.query.products.findMany.mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: 'XYZ',
        name: 'Product XYZ',
      },
    ]);

    await expect(service.getProductOptions()).resolves.toEqual([
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: 'XYZ',
        name: 'Product XYZ',
      },
    ]);

    expect(db.query.products.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: {
          id: true,
          code: true,
          name: true,
        },
      }),
    );
  });
});
