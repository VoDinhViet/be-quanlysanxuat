import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, eq, isNull, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import {
  isPermissionCode,
  type PermissionCode,
  PERMISSION_CODES,
  SUPER_PERMISSION,
} from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { credentials, roles } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { PermissionsService } from '../auth/permissions.service';
import { CreateRoleReqDto } from './dto/create-role.req.dto';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { PermissionGroupResDto, PermissionItemResDto } from './dto/permission-catalog.res.dto';
import { RoleResDto } from './dto/role.res.dto';
import { UpdateRoleReqDto } from './dto/update-role.req.dto';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly permissionsService: PermissionsService,
  ) {}

  async getRoles(reqDto: GetRolesReqDto): Promise<OffsetPaginatedDto<RoleResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(roles.deletedAt),
      keyword
        ? or(unaccentILike(roles.code, keyword), unaccentILike(roles.name, keyword))
        : undefined,
    );

    const [entities, count] = await Promise.all([
      this.db.query.roles.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(roles.createdAt),
      }),
      this.db.select({ total: drizzleCount() }).from(roles).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(RoleResDto, entities, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async getRoleDetail(roleId: string): Promise<RoleResDto> {
    const role = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, roleId), isNull(roles.deletedAt)),
    });

    if (!role) {
      throw new AppException(ErrorCode.E027, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(RoleResDto, role, { excludeExtraneousValues: true });
  }

  async createRole(reqDto: CreateRoleReqDto, actorCredentialId: string): Promise<RoleResDto> {
    await this.validateCodeUniqueness(reqDto.code);
    this.validatePermissions(reqDto.permissions);
    await this.ensureActorMayGrant(reqDto.permissions, actorCredentialId);

    const [role] = await this.db
      .insert(roles)
      .values({
        code: reqDto.code,
        name: reqDto.name,
        description: reqDto.description,
        permissions: reqDto.permissions,
      })
      .returning();

    return this.getRoleDetail(role.id);
  }

  async updateRole(
    roleId: string,
    reqDto: UpdateRoleReqDto,
    actorCredentialId: string,
  ): Promise<RoleResDto> {
    const role = await this.ensureRoleExists(roleId);
    this.ensureNotSystemRole(role.isSystem);

    if (reqDto.permissions) {
      this.validatePermissions(reqDto.permissions);
      await this.ensureActorMayGrant(reqDto.permissions, actorCredentialId);
    }

    const roleUpdate = {
      name: reqDto.name,
      description: reqDto.description,
      permissions: reqDto.permissions,
    };
    if (Object.values(roleUpdate).some((value) => value !== undefined)) {
      await this.db.update(roles).set(roleUpdate).where(eq(roles.id, roleId));
    }

    // Permission set may have changed — drop the cached permissions for this role so the next
    // request for any user holding it reloads fresh.
    await this.permissionsService.invalidateRole(roleId);

    return this.getRoleDetail(roleId);
  }

  async deleteRole(roleId: string): Promise<void> {
    const role = await this.ensureRoleExists(roleId);
    this.ensureNotSystemRole(role.isSystem);
    await this.ensureRoleNotInUse(roleId);

    await this.db.update(roles).set({ deletedAt: new Date() }).where(eq(roles.id, roleId));
    await this.permissionsService.invalidateRole(roleId);
  }

  getPermissionCatalog(): PermissionGroupResDto[] {
    const grouped = new Map<string, PermissionItemResDto[]>();

    for (const code of PERMISSION_CODES) {
      const [resource, action] = code.split(':');
      const items = grouped.get(resource) ?? [];
      items.push(plainToInstance(PermissionItemResDto, { code, action }));
      grouped.set(resource, items);
    }

    return Array.from(grouped.entries()).map(([resource, permissions]) =>
      plainToInstance(PermissionGroupResDto, { resource, permissions }),
    );
  }

  private validatePermissions(permissions: string[]): void {
    const invalid = permissions.filter((permission) => !isPermissionCode(permission));

    if (invalid.length > 0) {
      throw new AppException(ErrorCode.E031, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Prevents privilege escalation: a caller may only put the god-mode `system:manage` code on a
   * role if they already hold it. Otherwise a `roles:create`/`roles:update` holder could mint a
   * role granting full control and assign it to themselves. Only the actor's own permission set
   * is consulted (cached), and only when `system:manage` is actually being granted.
   */
  private async ensureActorMayGrant(
    permissions: PermissionCode[],
    actorCredentialId: string,
  ): Promise<void> {
    if (!permissions.includes(SUPER_PERMISSION)) {
      return;
    }

    const actorPermissions = await this.permissionsService.getPermissionCodes(actorCredentialId);

    if (!actorPermissions.includes(SUPER_PERMISSION)) {
      throw new AppException(ErrorCode.E034, HttpStatus.FORBIDDEN);
    }
  }

  private ensureNotSystemRole(isSystem: boolean): void {
    if (isSystem) {
      throw new AppException(ErrorCode.E030, HttpStatus.FORBIDDEN);
    }
  }

  private async ensureRoleExists(roleId: string) {
    const existing = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, roleId), isNull(roles.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E027, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.roles.findFirst({
      columns: { id: true },
      where: and(eq(roles.code, code), isNull(roles.deletedAt)),
    });

    if (existing) {
      throw new AppException(ErrorCode.E028, HttpStatus.CONFLICT);
    }
  }

  private async ensureRoleNotInUse(roleId: string): Promise<void> {
    const assigned = await this.db.query.credentials.findFirst({
      columns: { id: true },
      where: eq(credentials.roleId, roleId),
    });

    if (assigned) {
      throw new AppException(ErrorCode.E029, HttpStatus.CONFLICT);
    }
  }
}
