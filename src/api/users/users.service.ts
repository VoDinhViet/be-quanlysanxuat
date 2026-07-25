import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNull,
  ne,
  or,
} from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { ErrorCode } from '../../constants/error-code.constant';
import {
  type PermissionCode,
  SUPER_PERMISSION,
} from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  credentials,
  departments,
  files,
  positions,
  roles,
  users,
  UserStatus,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { PermissionsService } from '../auth/permissions.service';
import { FilesService } from '../files/files.service';
import { AssignRoleReqDto } from './dto/assign-role.req.dto';
import { CreateCredentialReqDto } from './dto/create-credential.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { CredentialResDto } from './dto/credential.res.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserResDto } from './dto/user.res.dto';

@Injectable()
export class UsersService {
  private static readonly PASSWORD_SALT_ROUNDS = 10;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly permissionsService: PermissionsService,
    private readonly filesService: FilesService,
  ) {}

  async getUsers(
    reqDto: GetUsersReqDto,
  ): Promise<OffsetPaginatedDto<UserResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = keyword
      ? or(ilike(users.fullName, keyword), ilike(users.code, keyword))
      : undefined;
    const orderBy = desc(users.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.users.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
        with: {
          department: true,
          position: true,
          credential: { with: { role: true } },
          avatarFile: true,
        },
      }),
      this.db.select({ total: count() }).from(users).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(UserResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getCurrentUser(credentialId: string): Promise<CredentialResDto> {
    // `fullName` lives on the linked `users` (employee) row, `role` on `roles`, and the `avatar` on
    // `files` (via the user's `avatarFileId`) — none is a column on `credentials`, so all three are
    // left-joined: a credential with no linked user (e.g. an admin-only login), no role, or no
    // avatar still returns a row.
    const [row] = await this.db
      .select({
        id: credentials.id,
        username: credentials.username,
        email: credentials.email,
        fullName: users.fullName,
        avatarFile: getTableColumns(files),
        role: getTableColumns(roles),
        createdAt: credentials.createdAt,
        updatedAt: credentials.updatedAt,
      })
      .from(credentials)
      .leftJoin(users, eq(users.credentialId, credentials.id))
      .leftJoin(roles, eq(roles.id, credentials.roleId))
      .leftJoin(files, eq(files.id, users.avatarFileId))
      .where(eq(credentials.id, credentialId))
      .limit(1);

    if (!row) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    // Effective permissions come from the cached resolver (the ADMIN role carries
    // `system:manage`), so the FE can drive permission-based UI.
    const permissions =
      await this.permissionsService.getPermissionCodes(credentialId);

    return plainToInstance(
      CredentialResDto,
      // A left-joined miss surfaces as an all-null object, not `null` — collapse `role`/`avatarFile`
      // so the DTO renders `null` instead of a ref/file full of null fields.
      {
        ...row,
        role: row.role?.id ? row.role : null,
        avatarFile: row.avatarFile?.id ? row.avatarFile : null,
        permissions,
      },
      { excludeExtraneousValues: true },
    );
  }

  async createUser(
    reqDto: CreateUserReqDto,
    actorCredentialId: string,
  ): Promise<UserResDto> {
    // `credential` is a nested object, not a column on `users` — peel it off so the spread below
    // only carries real columns.
    const { credential, ...userFields } = reqDto;

    await Promise.all([
      this.ensureDepartmentExists(reqDto.departmentId),
      this.ensurePositionInDepartment(reqDto.positionId, reqDto.departmentId),
    ]);

    if (reqDto.idNumber) {
      await this.validateIdNumberUniqueness(reqDto.idNumber);
    }
    if (reqDto.avatarFileId) {
      await this.filesService.linkFiles([reqDto.avatarFileId]);
    }
    // Read-only check, so it belongs with the others — before any write happens.
    if (credential?.roleId) {
      await this.resolveRoleForAssignment(credential.roleId, actorCredentialId);
    }

    // Provision the ERP credential (if requested) before inserting the user row, so a
    // failed credential creation (e.g. duplicate username/email) never leaves an orphan user.
    let credentialId: string | undefined;
    if (credential) {
      credentialId = await this.createCredential(credential);
    }

    const code = await this.generateUserCode();

    const [user] = await this.db
      .insert(users)
      .values({
        ...userFields,
        code,
        status: reqDto.status ?? UserStatus.WORKING,
        credentialId,
        createdBy: actorCredentialId,
      })
      .returning();

    return this.getUserDetail(user.id);
  }

  async updateUser(
    userId: string,
    reqDto: UpdateUserReqDto,
    actorCredentialId: string,
  ): Promise<UserResDto> {
    const existing = await this.ensureUserExists(userId);

    // Re-validate the (department, position) pair whenever either side changes — including when
    // only one of the two is sent, against the other's *effective* value (the new one if sent,
    // else the user's current one). A department-only change without a matching new position
    // will always mismatch (E064) by design, since a position belongs to exactly one department.
    // Both are required UUIDs on the DTO, so a truthy check is equivalent to `!== undefined` here.
    if (reqDto.departmentId || reqDto.positionId) {
      if (reqDto.departmentId) {
        await this.ensureDepartmentExists(reqDto.departmentId);
      }
      await this.ensurePositionInDepartment(
        reqDto.positionId ?? existing.positionId,
        reqDto.departmentId ?? existing.departmentId,
      );
    }
    if (reqDto.idNumber) {
      await this.validateIdNumberUniqueness(reqDto.idNumber, userId);
    }
    if (reqDto.avatarFileId) {
      await this.filesService.linkFiles([reqDto.avatarFileId]);
    }
    // Role assignment rides along on the profile update, but the role itself lives on the login
    // credential — a user with no credential has nothing to assign to (E032). Same rules as the
    // dedicated `PATCH /users/:userId/role`; both go through `resolveRoleForAssignment`.
    if (reqDto.roleId) {
      if (!existing.credentialId) {
        throw new AppException(ErrorCode.E032, HttpStatus.BAD_REQUEST);
      }
      await this.resolveRoleForAssignment(reqDto.roleId, actorCredentialId);
    }

    // `roleId` has no column on `users` — peel it off before the spread.
    const { roleId, ...userFields } = reqDto;

    // `updatedAt` is always written, which doubles as the reason `.set()` is safe here: drizzle
    // throws a bare "No values to set" (a 500) when every value is `undefined`, i.e. on an empty
    // PATCH body or one carrying only `roleId`.
    await this.db
      .update(users)
      .set({ ...userFields, updatedAt: new Date() })
      .where(eq(users.id, userId));

    if (roleId && existing.credentialId) {
      await this.applyRoleToCredential(existing.credentialId, roleId);
    }

    return this.getUserDetail(userId);
  }

  /**
   * Assigns a role to a user. The role lives on the user's login `credential` (the JWT subject),
   * so the user must have a linked credential (E032). Clears the credential's cached permissions
   * so the change takes effect on the next request.
   *
   * Privilege escalation guard: assigning a role that grants the god-mode `system:manage` code
   * (e.g. the seeded ADMIN role) is only allowed if the actor already holds `system:manage` —
   * otherwise a `roles:update` holder could grant themselves full control (E034).
   */
  async assignRole(
    userId: string,
    reqDto: AssignRoleReqDto,
    actorCredentialId: string,
  ): Promise<UserResDto> {
    const user = await this.db.query.users.findFirst({
      columns: { id: true, credentialId: true },
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppException(ErrorCode.E012, HttpStatus.NOT_FOUND);
    }

    if (!user.credentialId) {
      throw new AppException(ErrorCode.E032, HttpStatus.BAD_REQUEST);
    }

    await this.resolveRoleForAssignment(reqDto.roleId, actorCredentialId);

    await this.applyRoleToCredential(user.credentialId, reqDto.roleId);

    return this.getUserDetail(userId);
  }

  /**
   * Every check that must pass before a role may be written onto a credential, in the order the
   * client sees them: the actor is allowed to manage roles at all (E033) → the role exists (E027)
   * → the actor isn't escalating their own privileges through it (E034).
   *
   * Shared by all three assignment paths (`POST /users`, `PATCH /users/:userId`,
   * `PATCH /users/:userId/role`) so none of them can drift away from the others.
   */
  private async resolveRoleForAssignment(
    roleId: string,
    actorCredentialId: string,
  ): Promise<void> {
    await this.ensureActorMayManageRoles(actorCredentialId);
    const role = await this.ensureRoleExists(roleId);
    await this.ensureActorMayAssign(role.permissions, actorCredentialId);
  }

  /**
   * `POST /users` and `PATCH /users/:userId` are guarded by `users:create`/`users:update`, which
   * say nothing about roles — so assigning one through them needs `roles:update` checked here
   * instead, and only when a `roleId` was actually sent. Without this, `users:create` alone would
   * quietly become "may grant any role".
   *
   * `system:manage` passes, mirroring `PermissionsGuard` — otherwise a Super Admin would be
   * blocked by this service despite passing every route guard.
   */
  private async ensureActorMayManageRoles(
    actorCredentialId: string,
  ): Promise<void> {
    const actorPermissions =
      await this.permissionsService.getPermissionCodes(actorCredentialId);

    const mayManage =
      actorPermissions.includes(SUPER_PERMISSION) ||
      actorPermissions.includes('roles:update');

    if (!mayManage) {
      throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
    }
  }

  /** Writes the role onto the credential and drops its cached role→permissions mapping, so the
   * change takes effect on that identity's next request instead of after the cache TTL. */
  private async applyRoleToCredential(
    credentialId: string,
    roleId: string,
  ): Promise<void> {
    await this.db
      .update(credentials)
      .set({ roleId })
      .where(eq(credentials.id, credentialId));

    await this.permissionsService.invalidateCredential(credentialId);
  }

  private async ensureActorMayAssign(
    rolePermissions: PermissionCode[],
    actorCredentialId: string,
  ): Promise<void> {
    if (!rolePermissions.includes(SUPER_PERMISSION)) {
      return;
    }

    const actorPermissions =
      await this.permissionsService.getPermissionCodes(actorCredentialId);

    if (!actorPermissions.includes(SUPER_PERMISSION)) {
      throw new AppException(ErrorCode.E034, HttpStatus.FORBIDDEN);
    }
  }

  private async ensureRoleExists(roleId: string) {
    const existing = await this.db.query.roles.findFirst({
      columns: { id: true, permissions: true },
      where: and(eq(roles.id, roleId), isNull(roles.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E027, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async createCredential(
    credential: CreateCredentialReqDto,
  ): Promise<string> {
    await Promise.all([
      this.validateCredentialUsernameUniqueness(credential.username),
      this.validateCredentialEmailUniqueness(credential.email),
    ]);

    const password = await hash(
      credential.password,
      UsersService.PASSWORD_SALT_ROUNDS,
    );

    // `roleId` is already validated by the caller (`createUser` runs `resolveRoleForAssignment`
    // with the other read-only checks). No cache to invalidate — this credential id is brand new,
    // so `PermissionsService` has never resolved it.
    const [created] = await this.db
      .insert(credentials)
      .values({ ...credential, password })
      .returning();

    return created.id;
  }

  async getUserDetail(userId: string): Promise<UserResDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        department: true,
        position: true,
        credential: { with: { role: true } },
        avatarFile: true,
      },
    });

    if (!user) {
      throw new AppException(ErrorCode.E012, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(UserResDto, user, {
      excludeExtraneousValues: true,
    });
  }

  /** Returns the columns callers need right after (department/position, to compute the
   * "effective" pair on a partial update; `credentialId`, to assign a role) instead of a second
   * re-fetch. */
  private async ensureUserExists(userId: string): Promise<{
    id: string;
    departmentId: string;
    positionId: string;
    credentialId: string | null;
  }> {
    const existing = await this.db.query.users.findFirst({
      columns: {
        id: true,
        departmentId: true,
        positionId: true,
        credentialId: true,
      },
      where: eq(users.id, userId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E012, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async ensureDepartmentExists(departmentId: string): Promise<void> {
    const existing = await this.db.query.departments.findFirst({
      columns: { id: true },
      where: eq(departments.id, departmentId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E014, HttpStatus.NOT_FOUND);
    }
  }

  /** A position must (a) exist (`E015`) and (b) belong to `departmentId` (`E064`) — a chức vụ is
   * always scoped to exactly one phòng ban. One query covers both checks. */
  private async ensurePositionInDepartment(
    positionId: string,
    departmentId: string,
  ): Promise<void> {
    const position = await this.db.query.positions.findFirst({
      columns: { id: true, departmentId: true },
      where: eq(positions.id, positionId),
    });

    if (!position) {
      throw new AppException(ErrorCode.E015, HttpStatus.NOT_FOUND);
    }
    if (position.departmentId !== departmentId) {
      throw new AppException(ErrorCode.E064, HttpStatus.BAD_REQUEST);
    }
  }

  private async validateIdNumberUniqueness(
    idNumber: string,
    ignoredUserId?: string,
  ): Promise<void> {
    const where = ignoredUserId
      ? and(eq(users.idNumber, idNumber), ne(users.id, ignoredUserId))
      : eq(users.idNumber, idNumber);

    const existing = await this.db.query.users.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E013, HttpStatus.CONFLICT);
    }
  }

  private async validateCredentialUsernameUniqueness(
    username: string,
  ): Promise<void> {
    const existing = await this.db.query.credentials.findFirst({
      columns: { id: true },
      where: eq(credentials.username, username),
    });

    if (existing) {
      throw new AppException(ErrorCode.E001, HttpStatus.CONFLICT);
    }
  }

  private async validateCredentialEmailUniqueness(
    email: string,
  ): Promise<void> {
    const existing = await this.db.query.credentials.findFirst({
      columns: { id: true },
      where: eq(credentials.email, email),
    });

    if (existing) {
      throw new AppException(ErrorCode.E003, HttpStatus.CONFLICT);
    }
  }

  private async generateUserCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: count() }).from(users);
    return `NV${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
