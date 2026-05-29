import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { AuthService } from '../api/auth/auth.service';
import { AuthenticatedRequest } from '../api/auth/types/authenticated-request.interface';
import { IS_AUTH_OPTIONAL, IS_PUBLIC } from '../constants/app.constant';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private reflector: Reflector,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requestLabel = `${request.method} ${request.url}`;

    this.logger.debug(`[API Call] ${requestLabel}`);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug(`[Auth] Public route allowed: ${requestLabel}`);
      return true;
    }

    const isAuthOptional = this.reflector.getAllAndOverride<boolean>(IS_AUTH_OPTIONAL, [
      context.getHandler(),
      context.getClass(),
    ]);

    const accessToken = this.extractTokenFromHeader(request);

    if (isAuthOptional && !accessToken) {
      this.logger.debug(`[Auth] Optional auth without token: ${requestLabel}`);
      return true;
    }
    if (!accessToken) {
      this.logger.warn(`[Auth] Missing or invalid Authorization header: ${requestLabel}`);
      throw new UnauthorizedException();
    }

    try {
      request.user = await this.authService.verifyAccessToken(accessToken);
      this.logger.debug(
        `[Auth] Access token verified: ${requestLabel}, userId=${request.user.sub}, role=${request.user.role ?? 'none'}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown auth error';

      this.logger.warn(
        `[Auth] Access token verification failed: ${requestLabel}, reason=${errorMessage}`,
      );
      throw error;
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
