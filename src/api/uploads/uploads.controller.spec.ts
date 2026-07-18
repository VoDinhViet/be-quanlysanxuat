import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

describe('UploadsController', () => {
  let controller: UploadsController;
  let mockService: { buildFileResponse: jest.Mock };

  beforeEach(async () => {
    mockService = { buildFileResponse: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UploadsController>(UploadsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uploadFile delegates to UploadsService.buildFileResponse', () => {
    const file = { filename: 'a.png' } as Express.Multer.File;
    const expected = { url: '/uploads/a.png' };
    mockService.buildFileResponse.mockReturnValue(expected);

    const result = controller.uploadFile(file);

    expect(mockService.buildFileResponse).toHaveBeenCalledWith(file);
    expect(result).toBe(expected);
  });

  it('uploadDocument delegates to UploadsService.buildFileResponse', () => {
    const file = { filename: 'a.pdf' } as Express.Multer.File;
    const expected = { url: '/uploads/a.pdf' };
    mockService.buildFileResponse.mockReturnValue(expected);

    const result = controller.uploadDocument(file);

    expect(mockService.buildFileResponse).toHaveBeenCalledWith(file);
    expect(result).toBe(expected);
  });
});
