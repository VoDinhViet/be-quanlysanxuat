import {
  HttpCode,
  HttpStatus,
  type Type,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { STATUS_CODES } from 'http';
import { ErrorDto } from '../common/dto/error.dto';
import { ApiPaginatedResponse } from './swagger.decorators';
import { Public } from './public.decorator';

type ApiResponseType = number;
type ApiAuthType = 'basic' | 'api-key' | 'jwt';
type PaginationType = 'offset' | 'cursor';

interface IApiOptions<T extends Type<any>> {
  type?: T;
  summary?: string;
  description?: string;
  errorResponses?: ApiResponseType[];
  statusCode?: HttpStatus;
  isPaginated?: boolean;
  isArray?: boolean;
  paginationType?: PaginationType;
  /** Route trả file nhị phân (vd. Excel) thay vì JSON — mime type đăng ký ở Swagger, response
   * schema chuyển thành `string($binary)` thay vì `type`. */
  fileType?: string;
}

type IApiPublicOptions = IApiOptions<Type<any>>;

interface IApiAuthOptions extends IApiOptions<Type<any>> {
  auths?: ApiAuthType[];
}

/** Chọn đúng 1 response decorator theo `options` — dùng chung cho `ApiPublic`/`ApiAuth` vì cả hai
 * cần đúng logic này. File nhị phân (`fileType`) thắng trước, kể cả khi `isPaginated`/`statusCode`
 * cũng được truyền. */
function buildResponseDecorators(options: IApiOptions<Type<any>>) {
  const ok = {
    type: options.type as Type<any>,
    description: options?.description ?? 'OK',
    isArray: options.isArray || false,
    paginationType: options.paginationType || 'offset',
  };

  if (options.fileType) {
    return [
      ApiOkResponse({
        description: ok.description,
        schema: { type: 'string', format: 'binary' },
      }),
      ApiProduces(options.fileType),
    ];
  }
  if (options.isPaginated) {
    return [ApiPaginatedResponse(ok)];
  }
  if (options.statusCode === HttpStatus.CREATED) {
    return [ApiCreatedResponse(ok)];
  }
  return [ApiOkResponse(ok)];
}

export const ApiPublic = (options: IApiPublicOptions = {}): MethodDecorator => {
  const defaultStatusCode = HttpStatus.OK;
  const defaultErrorResponses = [
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.INTERNAL_SERVER_ERROR,
  ];

  const errorResponses = (options.errorResponses || defaultErrorResponses)?.map(
    (statusCode) =>
      ApiResponse({
        status: statusCode,
        type: ErrorDto,
        description: STATUS_CODES[statusCode],
      }),
  );

  return applyDecorators(
    Public(),
    ApiOperation({ summary: options?.summary }),
    HttpCode(options.statusCode || defaultStatusCode),
    ...buildResponseDecorators(options),
    ...errorResponses,
  );
};

export const ApiAuth = (options: IApiAuthOptions = {}): MethodDecorator => {
  const defaultStatusCode = HttpStatus.OK;
  const defaultErrorResponses = [
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.INTERNAL_SERVER_ERROR,
  ];
  const auths = options.auths || ['jwt'];

  const errorResponses = (options.errorResponses || defaultErrorResponses)?.map(
    (statusCode) =>
      ApiResponse({
        status: statusCode,
        type: ErrorDto,
        description: STATUS_CODES[statusCode],
      }),
  );

  const authDecorators = auths.map((auth) => {
    switch (auth) {
      case 'basic':
        return ApiBasicAuth();
      case 'api-key':
        return ApiSecurity('Api-Key');
      case 'jwt':
        return ApiBearerAuth();
    }
  });

  return applyDecorators(
    ApiOperation({ summary: options?.summary }),
    HttpCode(options.statusCode || defaultStatusCode),
    ...buildResponseDecorators(options),
    ...authDecorators,
    ...errorResponses,
  );
};
