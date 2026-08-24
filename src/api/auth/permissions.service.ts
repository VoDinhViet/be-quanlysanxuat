import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { PermissionCode } from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { credentials, roles } from '../../database/schemas';

/**
 * Resolves the effective permission set for an authenticated identity (the JWT `sub`, which is
 * a credential id) with one query, joining straight to the assigned role's `permissions` column.
 */
@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPermissionCodes(credentialId: string): Promise<PermissionCode[]> {
    const [row] = await this.db
      .select({ permissions: roles.permissions })
      .from(credentials)
      .innerJoin(
        roles,
        and(eq(roles.id, credentials.roleId), isNull(roles.deletedAt)),
      )
      .where(eq(credentials.id, credentialId))
      .limit(1);

    return row?.permissions ?? [];
  }
}
