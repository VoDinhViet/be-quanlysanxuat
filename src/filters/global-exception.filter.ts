import { Response } from 'express';
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STATUS_CODES } from 'http';
import postgres from 'postgres';
import { ErrorDetailDto } from '../common/dto/error-detail.dto';
import { ErrorDto } from '../common/dto/error.dto';
import { extractPostgresError } from '../common/utils/postgres-error.util';
import { AllConfigType } from '../config/config.type';
import { ErrorCode } from '../constants/error-code.constant';
import { AppException } from '../exceptions/app.exception';
import { Environment } from '../constants/app.constant';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private debug: boolean = false;
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Debug active on non-production
    this.debug =
      this.configService.getOrThrow('app.nodeEnv', { infer: true }) !==
      Environment.PRODUCTION;

    let error: ErrorDto;
    const pgError = extractPostgresError(exception);

    if (exception instanceof AppException) {
      error = this.handleAppException(exception);
    } else if (
      exception instanceof UnprocessableEntityException ||
      exception instanceof BadRequestException
    ) {
      error = this.handleValidationException(exception);
    } else if (exception instanceof PayloadTooLargeException) {
      // Multer's own FileInterceptor pre-transforms a MulterError(LIMIT_FILE_SIZE)
      // into this exact exception type before it ever reaches this filter.
      error = this.handlePayloadTooLargeException(exception);
    } else if (exception instanceof HttpException) {
      error = this.handleHttpException(exception);
    } else if (pgError) {
      error = this.handleDatabaseError(pgError);
    } else {
      error = this.handleError(exception as Error);
    }

    if (this.debug) {
      error.stack = exception instanceof Error ? exception.stack : undefined;
      error.trace = exception;
      this.logger.debug(error);
    }

    response.status(error.statusCode).json(error);
  }

  private handleAppException(exception: AppException): ErrorDto {
    const r = exception.getResponse() as Record<string, any>;
    const statusCode = exception.getStatus();

    const errorRes: ErrorDto = {
      timestamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode] || 'Error',
      errorCode: r.errorCode as string,
      message: (r.message as string) || 'Error',
    };

    this.logger.debug(exception);
    return errorRes;
  }

  private handleValidationException(
    exception: UnprocessableEntityException | BadRequestException,
  ): ErrorDto {
    const r = exception.getResponse() as Record<string, unknown>;
    const statusCode = exception.getStatus();

    let details: ErrorDetailDto[] = [];

    if (Array.isArray(r.message)) {
      details = r.message.map((msg: unknown) => {
        if (typeof msg === 'string') {
          return { property: 'validation', code: 'invalid', message: msg };
        }
        const msgObj = msg as Record<string, any>;
        return {
          property: (msgObj.property as string) || 'validation',
          code: 'invalid',
          message:
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            (Object.values(msgObj.constraints || {})[0] as string) || 'Error',
        };
      });
    }

    const errorRes: ErrorDto = {
      timestamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode] || 'Bad Request',
      message: 'Validation failed',
      details,
    };

    this.logger.debug(exception);
    return errorRes;
  }

  private handleHttpException(exception: HttpException): ErrorDto {
    const statusCode = exception.getStatus();
    const r = exception.getResponse() as Record<string, unknown> | string;

    const errorRes: ErrorDto = {
      timestamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode] || 'Error',
      message: this.scrubFilePathLeak(
        typeof r === 'string' ? r : (r.message as string) || exception.message,
      ),
    };

    this.logger.debug(exception);
    return errorRes;
  }

  /** `express.static` (`ServeStaticModule`) ném lỗi kèm nguyên văn đường dẫn đĩa khi thiếu file
   * (`ENOENT: ... open '/...'`) — lưới an toàn thứ hai, phòng khi thư viện đổi cách ném lỗi. Chặn
   * chính là `serveStaticOptions` ở `app.module.ts`, buộc lỗi đi qua filter này. */
  private scrubFilePathLeak(message: string): string {
    if (/ENOENT|no such file or directory/i.test(message)) {
      return 'Không tìm thấy tệp.';
    }
    return message;
  }

  private handlePayloadTooLargeException(
    exception: PayloadTooLargeException,
  ): ErrorDto {
    const statusCode = exception.getStatus();

    const errorRes: ErrorDto = {
      timestamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode] || 'Payload Too Large',
      errorCode: ErrorCode.E017,
      message: exception.message,
    };

    this.logger.debug(exception);
    return errorRes;
  }

  private handleDatabaseError(error: postgres.PostgresError): ErrorDto {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal database error';

    // Postgres unique constraint violation
    if (error.code === '23505') {
      status = HttpStatus.CONFLICT;
      message = error.detail || 'Data already exists';
    }
    // Postgres foreign key violation
    else if (error.code === '23503') {
      status = HttpStatus.BAD_REQUEST;
      message = error.detail || 'Foreign key violation';
    }

    const errorRes: ErrorDto = {
      timestamp: new Date().toISOString(),
      statusCode: status,
      error: STATUS_CODES[status] || 'Database Error',
      message,
    };

    this.logger.error(error);
    return errorRes;
  }

  private handleError(error: Error): ErrorDto {
    const statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    const errorRes: ErrorDto = {
      timestamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode] || 'Internal Server Error',
      message: this.scrubFilePathLeak(
        error?.message || 'An unexpected error occurred',
      ),
    };

    this.logger.error(error);
    return errorRes;
  }
}
