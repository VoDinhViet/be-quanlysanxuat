import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { BomItemRoutingController } from './bom-item-routing.controller';
import { CreateRoutingStepReqDto } from './dto/create-routing-step.req.dto';
import { UpdateRoutingStepReqDto } from './dto/update-routing-step.req.dto';
import { RoutingService } from './routing.service';

describe('BomItemRoutingController', () => {
  let controller: BomItemRoutingController;
  let mockService: {
    getRouting: jest.Mock;
    addStep: jest.Mock;
    updateStep: jest.Mock;
    deleteStep: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;
  const target = { productId: 'p1', bomItemId: 'item-1' };

  beforeEach(async () => {
    mockService = {
      getRouting: jest.fn(),
      addStep: jest.fn(),
      updateStep: jest.fn(),
      deleteStep: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BomItemRoutingController],
      providers: [{ provide: RoutingService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BomItemRoutingController>(BomItemRoutingController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOperations delegates to RoutingService.getRouting with a node ({ productId, bomItemId }) target', async () => {
    const expected = [{ id: 'step-1' }];
    mockService.getRouting.mockResolvedValue(expected);

    const result = await controller.getOperations('p1', 'item-1');

    expect(mockService.getRouting).toHaveBeenCalledWith(target);
    expect(result).toBe(expected);
  });

  it('addOperation delegates to RoutingService.addStep with the current user id', async () => {
    const reqDto = Object.assign(new CreateRoutingStepReqDto(), {
      operationId: 'operation-1',
    });
    const expected = { id: 'step-1' };
    mockService.addStep.mockResolvedValue(expected);

    const result = await controller.addOperation(
      'p1',
      'item-1',
      reqDto,
      payload,
    );

    expect(mockService.addStep).toHaveBeenCalledWith(
      target,
      reqDto,
      payload.sub,
    );
    expect(result).toBe(expected);
  });

  it('updateOperation delegates to RoutingService.updateStep', async () => {
    const reqDto = Object.assign(new UpdateRoutingStepReqDto(), {
      sortOrder: 2,
    });
    const expected = { id: 'step-1' };
    mockService.updateStep.mockResolvedValue(expected);

    const result = await controller.updateOperation(
      'p1',
      'item-1',
      'step-1',
      reqDto,
    );

    expect(mockService.updateStep).toHaveBeenCalledWith(
      target,
      'step-1',
      reqDto,
    );
    expect(result).toBe(expected);
  });

  it('deleteOperation delegates to RoutingService.deleteStep', async () => {
    mockService.deleteStep.mockResolvedValue(undefined);

    const result = await controller.deleteOperation('p1', 'item-1', 'step-1');

    expect(mockService.deleteStep).toHaveBeenCalledWith(target, 'step-1');
    expect(result).toBeUndefined();
  });
});
