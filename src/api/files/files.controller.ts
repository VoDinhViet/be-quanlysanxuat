import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { multerOptions } from './config/multer.config';
import { DownloadFileReqDto } from './dto/download-file.req.dto';
import { FileResDto } from './dto/file.res.dto';
import { UploadFileReqDto } from './dto/upload-file.req.dto';
import { FileSignatureGuard } from './guards/file-signature.guard';
import { FilesService } from './files.service';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * No `@Permissions(...)`: any authenticated user may upload any type for now. That is a
   * deliberate simplification (see `UPLOAD_POLICIES` in `upload-policy.ts` for how to turn
   * per-type permissions on) — not an omission to be "fixed" by copying a permission from elsewhere.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', multerOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiAuth({
    type: FileResDto,
    summary:
      'Upload a file (registered in the `files` registry, not linked to any entity yet)',
    statusCode: HttpStatus.CREATED,
  })
  uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() reqDto: UploadFileReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<FileResDto> {
    return this.filesService.upload(file, {
      type: reqDto.type,
      uploadedBy: payload.sub,
    });
  }

  @Get(':fileId')
  @ApiAuth({
    type: FileResDto,
    summary: 'Get file metadata',
  })
  getFile(@UUIDParam('fileId') fileId: string): Promise<FileResDto> {
    return this.filesService.getFileById(fileId);
  }

  /**
   * `@Public()` (via `@ApiPublic`) on purpose: a browser cannot put an `Authorization` header on
   * `<img src>`, so the signed `exp`/`sig` pair is the credential here and `FileSignatureGuard`
   * is what enforces it. Removing that guard would expose every file to the internet.
   */
  @Get(':fileId/download')
  @UseGuards(FileSignatureGuard)
  @ApiPublic({
    summary: 'Download file bytes — requires a signed URL, not a bearer token',
  })
  downloadFile(
    @UUIDParam('fileId') fileId: string,
    @Query() reqDto: DownloadFileReqDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.filesService.streamFile(fileId, reqDto, res);
  }

  @Delete(':fileId')
  @ApiAuth({
    summary:
      'Delete a file (uploader or system:manage only; removes registry row and bytes)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteFile(
    @UUIDParam('fileId') fileId: string,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.filesService.deleteFile(fileId, payload.sub);
  }
}
