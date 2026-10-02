import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorDetailDto } from '../common/dto/error-detail.dto';
import { ErrorCode } from '../constants/error-code.constant';

/**
 * AppException used to throw business errors with a custom error code,
 * specific HTTP status, and optional message.
 */
export class AppException extends HttpException {
  constructor(
    errorCode: ErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    message?: string,
    details?: ErrorDetailDto[],
  ) {
    super({ errorCode, message, details }, status);
  }
}
