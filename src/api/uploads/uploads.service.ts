import { HttpStatus, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { ErrorCode } from '../../constants/error-code.constant';
import { AppException } from '../../exceptions/app.exception';
import { UploadResDto } from './dto/upload.res.dto';

@Injectable()
export class UploadsService {
  buildFileResponse(file?: Express.Multer.File): UploadResDto {
    if (!file) {
      throw new AppException(ErrorCode.E016, HttpStatus.BAD_REQUEST);
    }

    return plainToInstance(
      UploadResDto,
      {
        url: `/uploads/${file.filename}`,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
      },
      { excludeExtraneousValues: true },
    );
  }
}
