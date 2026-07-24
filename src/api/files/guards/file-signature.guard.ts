import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { AllConfigType } from '../../../config/config.type';
import { ErrorCode } from '../../../constants/error-code.constant';
import { AppException } from '../../../exceptions/app.exception';
import { isExpired, isSignatureValid } from '../util/file-url.util';

/**
 * Authorizes `GET /files/:id/download` by the `exp`/`sig` query pair instead of a bearer token —
 * the route is `@Public()` precisely so a browser can load it from `<img src>`, which cannot carry
 * an `Authorization` header. The signature is the credential.
 *
 * Order matters: signature first, expiry second. Reporting "expired" for a URL whose signature
 * never validated would tell an attacker their forgery was structurally right.
 */
@Injectable()
export class FileSignatureGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request<{ id: string }>>();
    const { id } = request.params;
    const { exp, sig } = request.query;

    if (typeof exp !== 'string' || typeof sig !== 'string' || !id) {
      throw new AppException(ErrorCode.E044, HttpStatus.UNAUTHORIZED);
    }

    const expiresAt = Number(exp);

    // `Number('')` is 0 and `Number('12abc')` is NaN — both must fail before reaching the HMAC,
    // otherwise a non-numeric `exp` would be signed-over as the literal string and could validate.
    if (!Number.isInteger(expiresAt)) {
      throw new AppException(ErrorCode.E044, HttpStatus.UNAUTHORIZED);
    }

    const secret = this.configService.getOrThrow('upload.urlSecret', {
      infer: true,
    });

    if (!isSignatureValid(id, expiresAt, sig, secret)) {
      throw new AppException(ErrorCode.E044, HttpStatus.UNAUTHORIZED);
    }

    if (isExpired(expiresAt)) {
      throw new AppException(ErrorCode.E045, HttpStatus.UNAUTHORIZED);
    }

    return true;
  }
}
