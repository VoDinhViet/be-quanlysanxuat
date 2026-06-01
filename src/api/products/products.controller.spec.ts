import { Test, TestingModule } from '@nestjs/testing';
import { ProductItemType } from '../../database/schemas';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: jest.Mocked<
    Pick<
      ProductsService,
      | 'createBomLine'
      | 'createProduct'
      | 'createProductRevision'
      | 'deleteBomLine'
      | 'deleteProduct'
      | 'getBomTree'
      | 'getProductOptions'
      | 'getProductRevisions'
      | 'getProducts'
      | 'getRouting'
      | 'lockProduct'
      | 'updateBomLine'
      | 'updateRouting'
    >
  >;

  beforeEach(async () => {
    productsService = {
      createBomLine: jest.fn(),
      createProduct: jest.fn(),
      createProductRevision: jest.fn(),
      deleteBomLine: jest.fn(),
      deleteProduct: jest.fn(),
      getBomTree: jest.fn(),
      getProductOptions: jest.fn(),
      getProductRevisions: jest.fn(),
      getProducts: jest.fn(),
      getRouting: jest.fn(),
      lockProduct: jest.fn(),
      updateBomLine: jest.fn(),
      updateRouting: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: productsService,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate product list queries to service', async () => {
    const reqDto = { limit: 20, page: 1, offset: 0 } as never;
    const response = { data: [], pagination: { totalRecords: 0 } } as never;
    productsService.getProducts.mockResolvedValue(response);

    await expect(controller.getProducts(reqDto)).resolves.toBe(response);

    expect(productsService.getProducts).toHaveBeenCalledWith(reqDto);
  });

  it('should delegate product creation to service', async () => {
    const reqDto: CreateProductReqDto = {
      code: 'XYZ',
      name: 'Product XYZ',
      itemType: ProductItemType.Fg,
      unitId: '550e8400-e29b-41d4-a716-446655440000',
      revisionNo: 'R1',
    };
    const response = { id: '550e8400-e29b-41d4-a716-446655440001' } as never;
    productsService.createProduct.mockResolvedValue(response);

    await expect(controller.createProduct(reqDto)).resolves.toBe(response);

    expect(productsService.createProduct).toHaveBeenCalledWith(reqDto);
  });

  it('should delegate product options to service', async () => {
    const response = [{ id: '550e8400-e29b-41d4-a716-446655440001', code: 'XYZ' }] as never;
    productsService.getProductOptions.mockResolvedValue(response);

    await expect(controller.getProductOptions()).resolves.toBe(response);

    expect(productsService.getProductOptions).toHaveBeenCalledWith();
  });

  it('should delegate product revisions to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const response = [{ id: '550e8400-e29b-41d4-a716-446655440002' }] as never;
    productsService.getProductRevisions.mockResolvedValue(response);

    await expect(controller.getProductRevisions(productId)).resolves.toBe(response);

    expect(productsService.getProductRevisions).toHaveBeenCalledWith(productId);
  });

  it('should delegate revision creation to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const reqDto = { revisionNo: 'R2' };
    const response = { id: '550e8400-e29b-41d4-a716-446655440002' } as never;
    productsService.createProductRevision.mockResolvedValue(response);

    await expect(controller.createProductRevision(productId, reqDto)).resolves.toBe(response);

    expect(productsService.createProductRevision).toHaveBeenCalledWith(productId, reqDto);
  });

  it('should delegate BOM tree queries to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const revisionId = '550e8400-e29b-41d4-a716-446655440002';
    const response = { productId, children: [] } as never;
    productsService.getBomTree.mockResolvedValue(response);

    await expect(controller.getBomTree(productId, revisionId)).resolves.toBe(response);

    expect(productsService.getBomTree).toHaveBeenCalledWith(productId, revisionId);
  });

  it('should delegate BOM line creation to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const revisionId = '550e8400-e29b-41d4-a716-446655440002';
    const reqDto = {
      parentItemId: productId,
      childItemId: '550e8400-e29b-41d4-a716-446655440003',
      qty: 1,
      unitId: '550e8400-e29b-41d4-a716-446655440004',
    };
    const response = { id: '550e8400-e29b-41d4-a716-446655440005' } as never;
    productsService.createBomLine.mockResolvedValue(response);

    await expect(controller.createBomLine(productId, revisionId, reqDto)).resolves.toBe(response);

    expect(productsService.createBomLine).toHaveBeenCalledWith(productId, revisionId, reqDto);
  });

  it('should delegate BOM line update to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const revisionId = '550e8400-e29b-41d4-a716-446655440002';
    const bomLineId = '550e8400-e29b-41d4-a716-446655440003';
    const reqDto = { qty: 2 };
    const response = { id: bomLineId } as never;
    productsService.updateBomLine.mockResolvedValue(response);

    await expect(controller.updateBomLine(productId, revisionId, bomLineId, reqDto)).resolves.toBe(
      response,
    );

    expect(productsService.updateBomLine).toHaveBeenCalledWith(
      productId,
      revisionId,
      bomLineId,
      reqDto,
    );
  });

  it('should delegate BOM line deletion to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const revisionId = '550e8400-e29b-41d4-a716-446655440002';
    const bomLineId = '550e8400-e29b-41d4-a716-446655440003';
    const response = { id: bomLineId } as never;
    productsService.deleteBomLine.mockResolvedValue(response);

    await expect(controller.deleteBomLine(productId, revisionId, bomLineId)).resolves.toBe(
      response,
    );

    expect(productsService.deleteBomLine).toHaveBeenCalledWith(productId, revisionId, bomLineId);
  });

  it('should delegate routing queries to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const revisionId = '550e8400-e29b-41d4-a716-446655440002';
    const itemId = '550e8400-e29b-41d4-a716-446655440003';
    const response = [{ id: '550e8400-e29b-41d4-a716-446655440004' }] as never;
    productsService.getRouting.mockResolvedValue(response);

    await expect(controller.getRouting(productId, revisionId, itemId)).resolves.toBe(response);

    expect(productsService.getRouting).toHaveBeenCalledWith(productId, revisionId, itemId);
  });

  it('should delegate routing updates to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const revisionId = '550e8400-e29b-41d4-a716-446655440002';
    const itemId = '550e8400-e29b-41d4-a716-446655440003';
    const reqDto = {
      steps: [{ operationId: '550e8400-e29b-41d4-a716-446655440004', stepNo: 1 }],
    };
    const response = [{ id: '550e8400-e29b-41d4-a716-446655440005' }] as never;
    productsService.updateRouting.mockResolvedValue(response);

    await expect(controller.updateRouting(productId, revisionId, itemId, reqDto)).resolves.toBe(
      response,
    );

    expect(productsService.updateRouting).toHaveBeenCalledWith(
      productId,
      revisionId,
      itemId,
      reqDto,
    );
  });

  it('should delegate product locking to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const response = { id: productId } as never;
    productsService.lockProduct.mockResolvedValue(response);

    await expect(controller.lockProduct(productId)).resolves.toBe(response);

    expect(productsService.lockProduct).toHaveBeenCalledWith(productId);
  });

  it('should delegate product deletion to service', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const response = { id: productId } as never;
    productsService.deleteProduct.mockResolvedValue(response);

    await expect(controller.deleteProduct(productId)).resolves.toBe(response);

    expect(productsService.deleteProduct).toHaveBeenCalledWith(productId);
  });
});
