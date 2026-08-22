import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { multerOptions } from './config/multer.config';
import { FileResDto } from './dto/file.res.dto';
import { UploadFileReqDto } from './dto/upload-file.req.dto';
import { FilesService } from './files.service';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

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
      uploadedBy: payload.userId,
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
    return this.filesService.deleteFile(fileId, payload.userId, payload.sub);
  }
}
