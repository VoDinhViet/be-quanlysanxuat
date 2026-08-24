import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';

import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import {
  isPermissionCode,
  SUPER_PERMISSION,
} from '../../constants/permission.constant';
import type { PermissionCode } from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { credentials, roles } from '../../database/schemas';
import type { RoleSelect } from '../../database/schemas/identity-access/roles';
import { AppException } from '../../exceptions/app.exception';
import { PermissionsService } from '../auth/permissions.service';
import { CreateRoleReqDto } from './dto/create-role.req.dto';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { RoleResDto } from './dto/role.res.dto';
import { UpdateRoleReqDto } from './dto/update-role.req.dto';

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** Catches a role still holding a permission code that no longer exists in
   * PERMISSION_CODES — `roles.permissions` is jsonb with no DB-level check, and
   * `validatePermissionCodes` only gates writes made through this service, so a row edited
   * directly in the DB (or left over from a renamed/removed code, see
   * drizzle/0147_repair_role_permissions.sql) would otherwise go unnoticed. */
  async onModuleInit(): Promise<void> {
    const allRoles = await this.db.query.roles.findMany({
      columns: { code: true, permissions: true },
    });

    for (const role of allRoles) {
      const invalid = role.permissions.filter(
        (code) => !isPermissionCode(code),
      );

      if (invalid.length > 0) {
        this.logger.warn(
          `Role "${role.code}" holds unknown permission code(s): ${invalid.join(', ')}`,
        );
      }
    }
  }

  async getRoles(reqDto: GetRolesReqDto): Promise<RoleResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.roles.findMany({
      where: and(
        isNull(roles.deletedAt),
        eq(roles.isProtected, false),
        keyword
          ? or(
              unaccentILike(roles.code, keyword),
              unaccentILike(roles.name, keyword),
            )
          : undefined,
      ),
      orderBy: desc(roles.createdAt),
    });

    return plainToInstance(RoleResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getRole(roleId: string): Promise<RoleResDto> {
    const role = await this.ensureRoleExists(roleId);

    return plainToInstance(RoleResDto, role, {
      excludeExtraneousValues: true,
    });
  }

  async createRole(
    reqDto: CreateRoleReqDto,
    actorCredentialId: string,
  ): Promise<void> {
    await this.validateRoleCodeUniqueness(reqDto.code);
    this.validatePermissionCodes(reqDto.permissions);
    await this.ensureActorMayGrantPermissions(
      reqDto.permissions,
      actorCredentialId,
    );

    await this.db.insert(roles).values({ ...reqDto });
  }

  async updateRole(
    roleId: string,
    reqDto: UpdateRoleReqDto,
    actorCredentialId: string,
  ): Promise<void> {
    const role = await this.ensureRoleExists(roleId);
    this.ensureRoleNotSystem(role);

    if (reqDto.code) {
      await this.validateRoleCodeUniqueness(reqDto.code, roleId);
    }
    if (reqDto.permissions) {
      this.validatePermissionCodes(reqDto.permissions);
      await this.ensureActorMayGrantPermissions(
        reqDto.permissions,
        actorCredentialId,
      );
    }

    // `updated_at` is bumped by the column's own `$onUpdate`.
    await this.db.update(roles).set(reqDto).where(eq(roles.id, roleId));
  }

  async deleteRole(roleId: string): Promise<void> {
    const role = await this.ensureRoleExists(roleId);
    this.ensureRoleNotSystem(role);
    await this.ensureRoleNotInUse(roleId);

    await this.db
      .update(roles)
      .set({ deletedAt: new Date() })
      .where(eq(roles.id, roleId));
  }

  private async ensureRoleExists(roleId: string): Promise<RoleSelect> {
    const existing = await this.db.query.roles.findFirst({
      where: and(eq(roles.id, roleId), isNull(roles.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E027, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private ensureRoleNotSystem(role: Pick<RoleSelect, 'isSystem'>): void {
    if (role.isSystem) {
      throw new AppException(ErrorCode.E030, HttpStatus.FORBIDDEN);
    }
  }

  private async ensureRoleNotInUse(roleId: string): Promise<void> {
    const assignedCredential = await this.db.query.credentials.findFirst({
      columns: { id: true },
      where: eq(credentials.roleId, roleId),
    });

    if (assignedCredential) {
      throw new AppException(ErrorCode.E029, HttpStatus.CONFLICT);
    }
  }

  private async validateRoleCodeUniqueness(
    code: string,
    ignoredRoleId?: string,
  ): Promise<void> {
    const where = ignoredRoleId
      ? and(eq(roles.code, code), ne(roles.id, ignoredRoleId))
      : eq(roles.code, code);

    const existing = await this.db.query.roles.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E028, HttpStatus.CONFLICT);
    }
  }

  private validatePermissionCodes(permissions: PermissionCode[]): void {
    const invalid = permissions.filter((code) => !isPermissionCode(code));

    if (invalid.length > 0) {
      throw new AppException(ErrorCode.E031, HttpStatus.BAD_REQUEST);
    }
  }

  /** Privilege escalation guard: granting a role the god-mode `system:manage` code — on create,
   * or by editing an existing role's `permissions` — is only allowed if the actor already holds
   * `system:manage`, mirroring `UsersService.ensureActorMayAssign` (assigning such a role to a
   * user); otherwise a `roles:update` holder could grant themselves full control via a role they
   * edit rather than one they assign. */
  private async ensureActorMayGrantPermissions(
    permissions: PermissionCode[],
    actorCredentialId: string,
  ): Promise<void> {
    if (!permissions.includes(SUPER_PERMISSION)) {
      return;
    }

    const actorPermissions =
      await this.permissionsService.getPermissionCodes(actorCredentialId);

    if (!actorPermissions.includes(SUPER_PERMISSION)) {
      throw new AppException(ErrorCode.E034, HttpStatus.FORBIDDEN);
    }
  }
}
