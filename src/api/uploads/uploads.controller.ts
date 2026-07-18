import { Controller, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '../../decorators/http.decorators';
import { documentMulterOptions, multerOptions } from './config/multer.config';
import { UploadResDto } from './dto/upload.res.dto';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

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
    type: UploadResDto,
    summary: 'Upload an image (max 5MB, jpeg/png/webp/gif)',
    statusCode: HttpStatus.CREATED,
  })
  uploadFile(@UploadedFile() file?: Express.Multer.File): UploadResDto {
    return this.uploadsService.buildFileResponse(file);
  }

  @Post('document')
  @UseInterceptors(FileInterceptor('file', documentMulterOptions))
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
    type: UploadResDto,
    summary: 'Upload a document (max 10MB, pdf/doc/docx/xls/xlsx)',
    statusCode: HttpStatus.CREATED,
  })
  uploadDocument(@UploadedFile() file?: Express.Multer.File): UploadResDto {
    return this.uploadsService.buildFileResponse(file);
  }
}
