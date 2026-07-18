import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { and, eq, isNull } from 'drizzle-orm';

import { CacheKey } from '../../constants/cache.constant';
import type { PermissionCode } from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { credentials, roles } from '../../database/schemas';
import { createCacheKey } from '../../utils/cache.util';

/**
 * Resolves the effective permission set for an authenticated identity (the JWT `sub`, which is
 * a credential id) and keeps it fresh via a two-level Redis cache:
 *
 *   credentialId --(CREDENTIAL_ROLE)--> roleId --(ROLE_PERMISSIONS)--> PermissionCode[]
 *
 * Splitting the cache in two lets each side be invalidated on its own: editing a role's
 * permissions clears only `ROLE_PERMISSIONS:<roleId>` (affecting every credential with that
 * role at once), and reassigning a user's role clears only `CREDENTIAL_ROLE:<credId>`.
 */
@Injectable()
export class PermissionsService {
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  /** Sentinel cached when a credential has no role, to distinguish it from a cache miss. */
  private static readonly NO_ROLE = '__none__';

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getPermissionCodes(credentialId: string): Promise<PermissionCode[]> {
    const roleId = await this.resolveRoleId(credentialId);

    if (!roleId) {
      return [];
    }

    return this.resolvePermissions(roleId);
  }

  async invalidateRole(roleId: string): Promise<void> {
    await this.cacheManager.del(createCacheKey(CacheKey.ROLE_PERMISSIONS, roleId));
  }

  async invalidateCredential(credentialId: string): Promise<void> {
    await this.cacheManager.del(createCacheKey(CacheKey.CREDENTIAL_ROLE, credentialId));
  }

  private async resolveRoleId(credentialId: string): Promise<string | null> {
    const key = createCacheKey(CacheKey.CREDENTIAL_ROLE, credentialId);
    const cached = await this.cacheManager.get<string>(key);

    if (cached !== undefined && cached !== null) {
      return cached === PermissionsService.NO_ROLE ? null : cached;
    }

    const credential = await this.db.query.credentials.findFirst({
      where: eq(credentials.id, credentialId),
      columns: { roleId: true },
    });
    const roleId = credential?.roleId ?? null;

    await this.cacheManager.set(
      key,
      roleId ?? PermissionsService.NO_ROLE,
      PermissionsService.CACHE_TTL_MS,
    );

    return roleId;
  }

  private async resolvePermissions(roleId: string): Promise<PermissionCode[]> {
    const key = createCacheKey(CacheKey.ROLE_PERMISSIONS, roleId);
    const cached = await this.cacheManager.get<PermissionCode[]>(key);

    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const role = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, roleId), isNull(roles.deletedAt)),
      columns: { permissions: true },
    });
    const permissions = role?.permissions ?? [];

    await this.cacheManager.set(key, permissions, PermissionsService.CACHE_TTL_MS);

    return permissions;
  }
}
