import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  let mockService: {
    getProducts: jest.Mock;
    getProductDetail: jest.Mock;
    createProduct: jest.Mock;
    updateProduct: jest.Mock;
    copyProduct: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getProducts: jest.fn(),
      getProductDetail: jest.fn(),
      createProduct: jest.fn(),
      updateProduct: jest.fn(),
      copyProduct: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getProducts delegates to ProductsService.getProducts', async () => {
    const reqDto = new GetProductsReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getProducts.mockResolvedValue(expected);

    const result = await controller.getProducts(reqDto);

    expect(mockService.getProducts).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getProductDetail delegates to ProductsService.getProductDetail', async () => {
    const expected = { id: 'p1' };
    mockService.getProductDetail.mockResolvedValue(expected);

    const result = await controller.getProductDetail('p1');

    expect(mockService.getProductDetail).toHaveBeenCalledWith('p1');
    expect(result).toBe(expected);
  });

  it('createProduct delegates to ProductsService.createProduct with the current user id', async () => {
    const reqDto = new CreateProductReqDto();
    const expected = { id: 'p1' };
    mockService.createProduct.mockResolvedValue(expected);

    const result = await controller.createProduct(reqDto, payload);

    expect(mockService.createProduct).toHaveBeenCalledWith(reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateProduct delegates to ProductsService.updateProduct', async () => {
    const reqDto = new UpdateProductReqDto();
    const expected = { id: 'p1' };
    mockService.updateProduct.mockResolvedValue(expected);

    const result = await controller.updateProduct('p1', reqDto);

    expect(mockService.updateProduct).toHaveBeenCalledWith('p1', reqDto);
    expect(result).toBe(expected);
  });

  it('copyProduct delegates to ProductsService.copyProduct with the current user id', async () => {
    const expected = { id: 'p2' };
    mockService.copyProduct.mockResolvedValue(expected);

    const result = await controller.copyProduct('p1', payload);

    expect(mockService.copyProduct).toHaveBeenCalledWith('p1', payload.sub);
    expect(result).toBe(expected);
  });
});
