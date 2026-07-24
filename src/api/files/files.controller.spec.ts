import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { UploadType } from '../../database/schemas';
import { DownloadFileReqDto } from './dto/download-file.req.dto';
import { UploadFileReqDto } from './dto/upload-file.req.dto';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileSignatureGuard } from './guards/file-signature.guard';

describe('FilesController', () => {
  let controller: FilesController;
  let mockService: {
    upload: jest.Mock;
    getFileById: jest.Mock;
    streamFile: jest.Mock;
    deleteFile: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      upload: jest.fn(),
      getFileById: jest.fn(),
      streamFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    // `@UseGuards(FileSignatureGuard)` makes Nest instantiate the real guard while wiring the
    // module — and it needs ConfigService, which this test has no reason to provide.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: FilesService, useValue: mockService }],
    })
      .overrideGuard(FileSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FilesController>(FilesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('uploadFile delegates to FilesService.upload with the current user id', async () => {
    const file = { originalname: 'a.png' } as Express.Multer.File;
    const reqDto = Object.assign(new UploadFileReqDto(), {
      type: UploadType.MATERIAL_DOCUMENT,
    });
    const expected = { id: 'file-1' };
    mockService.upload.mockResolvedValue(expected);

    const result = await controller.uploadFile(file, reqDto, payload);

    expect(mockService.upload).toHaveBeenCalledWith(file, {
      type: UploadType.MATERIAL_DOCUMENT,
      uploadedBy: payload.sub,
    });
    expect(result).toBe(expected);
  });

  it('downloadFile delegates to FilesService.streamFile with the signed query and response', async () => {
    const reqDto = Object.assign(new DownloadFileReqDto(), {
      exp: 123,
      sig: 'abc',
    });
    const res = {} as never;
    const expected = { stream: true };
    mockService.streamFile.mockResolvedValue(expected);

    const result = await controller.downloadFile('file-1', reqDto, res);

    expect(mockService.streamFile).toHaveBeenCalledWith('file-1', reqDto, res);
    expect(result).toBe(expected);
  });

  it('getFile delegates to FilesService.getFileById', async () => {
    const expected = { id: 'file-1' };
    mockService.getFileById.mockResolvedValue(expected);

    const result = await controller.getFile('file-1');

    expect(mockService.getFileById).toHaveBeenCalledWith('file-1');
    expect(result).toBe(expected);
  });

  it('deleteFile delegates to FilesService.deleteFile', async () => {
    mockService.deleteFile.mockResolvedValue(undefined);

    await controller.deleteFile('file-1', payload);

    expect(mockService.deleteFile).toHaveBeenCalledWith('file-1', payload.sub);
  });
});
