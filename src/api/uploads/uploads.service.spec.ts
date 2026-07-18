import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadsService],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildFileResponse', () => {
    it('maps an uploaded file to a UploadResDto', () => {
      const file = {
        filename: 'a1b2c3.png',
        mimetype: 'image/png',
        size: 1024,
      } as Express.Multer.File;

      const result = service.buildFileResponse(file);

      expect(result).toMatchObject({
        url: '/uploads/a1b2c3.png',
        filename: 'a1b2c3.png',
        mimetype: 'image/png',
        size: 1024,
      });
    });

    it('throws E016 when no file is provided', () => {
      expect(() => service.buildFileResponse(undefined)).toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
          response: { errorCode: ErrorCode.E016 },
        }),
      );
    });
  });
});
