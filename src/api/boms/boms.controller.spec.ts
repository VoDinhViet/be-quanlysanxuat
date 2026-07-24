import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { BomItemType } from '../../database/schemas';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

describe('BomsController', () => {
  let controller: BomsController;
  let mockService: {
    getBomTree: jest.Mock;
    addBomItem: jest.Mock;
    updateBomItem: jest.Mock;
    deleteBomItem: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getBomTree: jest.fn(),
      addBomItem: jest.fn(),
      updateBomItem: jest.fn(),
      deleteBomItem: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BomsController],
      providers: [{ provide: BomsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BomsController>(BomsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getBom delegates to BomsService.getBomTree', async () => {
    const expected = [{ id: 'a' }];
    mockService.getBomTree.mockResolvedValue(expected);

    const result = await controller.getBom('p1');

    expect(mockService.getBomTree).toHaveBeenCalledWith('p1');
    expect(result).toBe(expected);
  });

  it('addItem delegates to BomsService.addBomItem with the current user id', async () => {
    const reqDto = Object.assign(new CreateBomItemReqDto(), {
      itemType: BomItemType.MATERIAL,
      itemId: 'material-1',
      quantity: 2,
    });
    const expected = { id: 'item-1' };
    mockService.addBomItem.mockResolvedValue(expected);

    const result = await controller.addItem('p1', reqDto, payload);

    expect(mockService.addBomItem).toHaveBeenCalledWith(
      'p1',
      reqDto,
      payload.sub,
    );
    expect(result).toBe(expected);
  });

  it('updateItem delegates to BomsService.updateBomItem', async () => {
    const reqDto = Object.assign(new UpdateBomItemReqDto(), { quantity: 3 });
    const expected = { id: 'item-1' };
    mockService.updateBomItem.mockResolvedValue(expected);

    const result = await controller.updateItem('p1', 'item-1', reqDto);

    expect(mockService.updateBomItem).toHaveBeenCalledWith(
      'p1',
      'item-1',
      reqDto,
    );
    expect(result).toBe(expected);
  });

  it('deleteItem delegates to BomsService.deleteBomItem', async () => {
    mockService.deleteBomItem.mockResolvedValue(undefined);

    const result = await controller.deleteItem('p1', 'item-1');

    expect(mockService.deleteBomItem).toHaveBeenCalledWith('p1', 'item-1');
    expect(result).toBeUndefined();
  });
});
