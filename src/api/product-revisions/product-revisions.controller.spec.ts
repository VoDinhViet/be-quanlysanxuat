import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { UpdateProductRevisionReqDto } from './dto/update-product-revision.req.dto';
import { ProductRevisionsController } from './product-revisions.controller';
import { ProductRevisionsService } from './product-revisions.service';

describe('ProductRevisionsController', () => {
  let controller: ProductRevisionsController;
  let mockService: {
    getRevisions: jest.Mock;
    getRevisionDetail: jest.Mock;
    createRevision: jest.Mock;
    updateRevision: jest.Mock;
    activateRevision: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getRevisions: jest.fn(),
      getRevisionDetail: jest.fn(),
      createRevision: jest.fn(),
      updateRevision: jest.fn(),
      activateRevision: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductRevisionsController],
      providers: [{ provide: ProductRevisionsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductRevisionsController>(ProductRevisionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getRevisions delegates to ProductRevisionsService.getRevisions', async () => {
    const expected = [{ id: 'rev-1' }];
    mockService.getRevisions.mockResolvedValue(expected);

    const result = await controller.getRevisions('p1');

    expect(mockService.getRevisions).toHaveBeenCalledWith('p1');
    expect(result).toBe(expected);
  });

  it('getRevisionDetail delegates to ProductRevisionsService.getRevisionDetail', async () => {
    const expected = { id: 'rev-1' };
    mockService.getRevisionDetail.mockResolvedValue(expected);

    const result = await controller.getRevisionDetail('p1', 'rev-1');

    expect(mockService.getRevisionDetail).toHaveBeenCalledWith('p1', 'rev-1');
    expect(result).toBe(expected);
  });

  it('createRevision delegates to ProductRevisionsService.createRevision with the current user id', async () => {
    const reqDto = new CreateProductRevisionReqDto();
    const expected = { id: 'rev-1' };
    mockService.createRevision.mockResolvedValue(expected);

    const result = await controller.createRevision('p1', reqDto, payload);

    expect(mockService.createRevision).toHaveBeenCalledWith('p1', reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateRevision delegates to ProductRevisionsService.updateRevision', async () => {
    const reqDto = new UpdateProductRevisionReqDto();
    const expected = { id: 'rev-1' };
    mockService.updateRevision.mockResolvedValue(expected);

    const result = await controller.updateRevision('p1', 'rev-1', reqDto);

    expect(mockService.updateRevision).toHaveBeenCalledWith('p1', 'rev-1', reqDto);
    expect(result).toBe(expected);
  });

  it('activateRevision delegates to ProductRevisionsService.activateRevision', async () => {
    const expected = { id: 'rev-2' };
    mockService.activateRevision.mockResolvedValue(expected);

    const result = await controller.activateRevision('p1', 'rev-2');

    expect(mockService.activateRevision).toHaveBeenCalledWith('p1', 'rev-2');
    expect(result).toBe(expected);
  });
});
