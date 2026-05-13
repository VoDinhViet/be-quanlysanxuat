import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-code.constant';

/**
 * AppException used to throw business errors with a custom error code,
 * specific HTTP status, and message.
 */
export class AppException extends HttpException {
  constructor(
    errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ errorCode, message }, status);
  }
}
