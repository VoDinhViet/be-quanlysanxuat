import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNull,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { ErrorCode } from '../../constants/error-code.constant';
import {
  type PermissionCode,
  SUPER_PERMISSION,
} from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
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
import { CurrentUserResDto } from './dto/current-user.res.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { PageUserResDto } from './dto/page-user.res.dto';
import { GetUserOptionsReqDto } from './dto/get-user-options.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserRefResDto } from './dto/user-ref.res.dto';
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
  ): Promise<OffsetPaginatedDto<PageUserResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    // `credentials.isProtected` (hiện chỉ tài khoản admin) ẩn khỏi danh sách — cờ riêng trên
    // credential, không suy từ role, nên đổi role của tài khoản không tự ý làm nó hiện/ẩn lại.
    // `isNull` bắt buộc vì `LEFT JOIN credentials` để NULL khi user chưa có credential nào.
    const baseFilter = and(
      keyword
        ? or(ilike(users.fullName, keyword), ilike(users.code, keyword))
        : undefined,
      or(isNull(credentials.isProtected), eq(credentials.isProtected, false)),
    );
    const orderBy = desc(users.createdAt);

    const [entities, [{ total }]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(users),
          department: getTableColumns(departments),
          position: getTableColumns(positions),
          avatarFile: getTableColumns(files),
          email: credentials.email,
          role: getTableColumns(roles),
        })
        .from(users)
        .innerJoin(departments, eq(departments.id, users.departmentId))
        .innerJoin(positions, eq(positions.id, users.positionId))
        .leftJoin(files, eq(files.id, users.avatarFileId))
        .leftJoin(credentials, eq(credentials.userId, users.id))
        .leftJoin(roles, eq(roles.id, credentials.roleId))
        .where(baseFilter)
        .orderBy(orderBy)
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(users)
        .leftJoin(credentials, eq(credentials.userId, users.id))
        .where(baseFilter),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageUserResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  // Không đòi permission quản lý nhân sự — mirror WarehousesService.getWarehouseOptions, chỉ
  // để các màn khác (vd. "Người phụ trách" trên PO) chọn được đồng nghiệp đang làm việc. `q`
  // search theo code/fullName giống getUsers ở trên (ilike, không unaccent — cùng khuôn với
  // list chính của chính service này).
  async getUserOptions(reqDto: GetUserOptionsReqDto): Promise<UserRefResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.users.findMany({
      where: and(
        eq(users.status, UserStatus.WORKING),
        keyword
          ? or(ilike(users.fullName, keyword), ilike(users.code, keyword))
          : undefined,
      ),
      orderBy: asc(users.fullName),
      limit: 100,
    });

    return plainToInstance(UserRefResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getCurrentUser(credentialId: string): Promise<CurrentUserResDto> {
    // `fullName` sống ở `users` (bắt buộc gắn kèm — `innerJoin`), `role` ở `roles`, `avatar` ở
    // `files` (qua `users.avatarFileId`) — chỉ `role`/`avatarFile` còn có thể vắng mặt (left join).
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
      .innerJoin(users, eq(users.id, credentials.userId))
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
      CurrentUserResDto,
      { ...row, permissions },
      { excludeExtraneousValues: true },
    );
  }

  /** `credentials.userId` giờ NOT NULL — thứ tự ghi đảo ngược so với trước (`users` trước,
   * `credentials` sau, trỏ vào user vừa tạo), khác cách cũ (credential trước để tránh user mồ côi;
   * giờ chiều mồ côi đã đảo: một `users` không credential luôn hợp lệ). Mọi kiểm tra read-only
   * (department/position, uniqueness, quyền gán role) chạy trước khi mở transaction
   * (`.claude/rules/transactions.md`). */
  async createUser(
    reqDto: CreateUserReqDto,
    actorCredentialId: string,
    actorUserId: string,
  ): Promise<void> {
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
    if (credential?.roleId) {
      await this.resolveRoleForAssignment(credential.roleId, actorCredentialId);
    }
    if (credential) {
      await Promise.all([
        this.validateCredentialUsernameUniqueness(credential.username),
        this.validateCredentialEmailUniqueness(credential.email),
      ]);
    }

    const code = await this.generateUserCode();

    await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          ...userFields,
          code,
          status: reqDto.status ?? UserStatus.WORKING,
          createdBy: actorUserId,
        })
        .returning({ id: users.id });

      if (credential) {
        await this.createCredential(tx, credential, user.id);
      }
    });
  }

  async updateUser(
    userId: string,
    reqDto: UpdateUserReqDto,
    actorCredentialId: string,
  ): Promise<void> {
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

    // `credential` không có cột trên `users` — peel ra khỏi spread trước khi ghi hồ sơ. Không
    // gửi `credential` thì không đụng bảng `credentials` chút nào — user chưa có tài khoản đăng
    // nhập vẫn sửa được hồ sơ bình thường (trước đây `credentialEnabled` bắt buộc trên DTO nên
    // mọi lần PATCH đều đòi có credential sẵn, E032, kể cả khi chỉ sửa `note`).
    const { credential, ...userFields } = reqDto;

    const linkedCredential = credential
      ? await this.db.query.credentials.findFirst({
          where: eq(credentials.userId, userId),
          columns: { id: true },
        })
      : null;

    if (credential) {
      // Chưa có credential thì đây là tạo mới — mật khẩu bắt buộc (E207), khác nhánh sửa
      // credential sẵn có (bỏ trống = giữ mật khẩu cũ).
      if (!linkedCredential && !credential.password) {
        throw new AppException(ErrorCode.E207, HttpStatus.BAD_REQUEST);
      }
      if (credential.roleId) {
        await this.resolveRoleForAssignment(
          credential.roleId,
          actorCredentialId,
        );
      }
      await Promise.all([
        this.validateCredentialUsernameUniqueness(
          credential.username,
          linkedCredential?.id,
        ),
        this.validateCredentialEmailUniqueness(
          credential.email,
          linkedCredential?.id,
        ),
      ]);
    }

    // `updated_at` is bumped by the column's own `$onUpdate`.
    await this.db.update(users).set(userFields).where(eq(users.id, userId));

    if (!credential) {
      return;
    }

    if (linkedCredential) {
      await this.db
        .update(credentials)
        .set({
          username: credential.username,
          email: credential.email,
          roleId: credential.roleId,
          credentialEnabled: credential.credentialEnabled,
          ...(credential.password
            ? {
                password: await hash(
                  credential.password,
                  UsersService.PASSWORD_SALT_ROUNDS,
                ),
              }
            : {}),
        })
        .where(eq(credentials.id, linkedCredential.id));

      if (credential.roleId) {
        await this.permissionsService.invalidateCredential(linkedCredential.id);
      }
      return;
    }

    // Nhánh này chỉ chạy khi `linkedCredential` là null — mật khẩu đã được đảm bảo tồn tại ở
    // kiểm tra E207 phía trên; destructure lại ở đây chỉ để TS thu hẹp kiểu `string | undefined`
    // về `string` mà không cần `!`.
    const { password, ...credentialFields } = credential;
    if (!password) {
      throw new AppException(ErrorCode.E207, HttpStatus.BAD_REQUEST);
    }
    await this.db.transaction((tx) =>
      this.createCredential(tx, { ...credentialFields, password }, userId),
    );
  }

  /**
   * Assigns a role to a user. The role lives on the user's login `credential` (the JWT subject),
   * so the user must have a linked credential (E032).
   *
   * Rules:
   * - Clears the credential's cached permissions so the change takes effect on the next request.
   * - Privilege escalation guard: assigning a role that grants the god-mode `system:manage` code
   *   (e.g. the seeded ADMIN role) is only allowed if the actor already holds `system:manage` —
   *   otherwise a `roles:update` holder could grant themselves full control (E034).
   */
  async assignRole(
    userId: string,
    reqDto: AssignRoleReqDto,
    actorCredentialId: string,
  ): Promise<void> {
    const user = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppException(ErrorCode.E012, HttpStatus.NOT_FOUND);
    }

    const linkedCredential = await this.ensureCredentialLinked(userId);

    await this.resolveRoleForAssignment(reqDto.roleId, actorCredentialId);

    await this.applyRoleToCredential(linkedCredential.id, reqDto.roleId);
  }

  /**
   * Every check that must pass before a role may be written onto a credential, in the order the
   * client sees them: the actor is allowed to manage roles at all (E033) → the role exists (E027)
   * → the actor isn't escalating their own privileges through it (E034).
   *
   * Shared by all three assignment paths (`POST /users`, `PATCH /users/:userId`,
   * `PATCH /users/:userId/role`) so none of them drift away from the others.
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
   * say nothing about roles.
   *
   * Rules:
   * - Assigning one through them needs `roles:update` checked here instead, and only when a
   *   `roleId` was actually sent. Without this, `users:create` alone would quietly become "may
   *   grant any role".
   * - `system:manage` passes, mirroring `PermissionsGuard` — otherwise a Super Admin would be
   *   blocked by this service despite passing every route guard.
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

  /** `users` không còn giữ `credentialId` — tra ngược qua `credentials.userId` (unique); ném E032
   * nếu user chưa có credential, vì mọi nơi gọi hàm này đều cần ghi thẳng xuống credential đó. */
  private async ensureCredentialLinked(
    userId: string,
  ): Promise<{ id: string }> {
    const credential = await this.db.query.credentials.findFirst({
      where: eq(credentials.userId, userId),
      columns: { id: true },
    });

    if (!credential) {
      throw new AppException(ErrorCode.E032, HttpStatus.BAD_REQUEST);
    }

    return credential;
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

  /** Username/email uniqueness đã kiểm ở `createUser` trước khi mở transaction — đây chỉ còn lệnh
   * ghi. `roleId` cũng đã validate ở đó (`resolveRoleForAssignment`). Không cache để invalidate —
   * credential id còn mới tinh, `PermissionsService` chưa từng resolve nó. */
  private async createCredential(
    tx: DbTransaction,
    credential: CreateCredentialReqDto,
    userId: string,
  ): Promise<void> {
    const password = await hash(
      credential.password,
      UsersService.PASSWORD_SALT_ROUNDS,
    );

    await tx.insert(credentials).values({
      ...credential,
      userId,
      password,
      credentialEnabled: credential.credentialEnabled ?? true,
    });
  }

  async getUser(userId: string): Promise<UserResDto> {
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

  /** Bộ phận của một user, đọc trong transaction của nơi gọi (vd
   * `ProductionJobsService.startJob`) — `E012` nếu row `users` không còn (token còn hạn nhưng user
   * đã bị xoá mềm). */
  async getUserDepartmentId(
    tx: DbTransaction,
    userId: string,
  ): Promise<string> {
    const [user] = await tx
      .select({ departmentId: users.departmentId })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      throw new AppException(ErrorCode.E012, HttpStatus.NOT_FOUND);
    }

    return user.departmentId;
  }

  /** Returns the columns callers need right after — department/position, to compute the
   * "effective" pair on a partial update — instead of a second re-fetch. */
  private async ensureUserExists(userId: string): Promise<{
    id: string;
    departmentId: string;
    positionId: string;
  }> {
    const existing = await this.db.query.users.findFirst({
      columns: {
        id: true,
        departmentId: true,
        positionId: true,
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
    ignoredCredentialId?: string,
  ): Promise<void> {
    let where: SQL | undefined = eq(credentials.username, username);
    if (ignoredCredentialId) {
      where = and(where, ne(credentials.id, ignoredCredentialId));
    }

    const existing = await this.db.query.credentials.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E001, HttpStatus.CONFLICT);
    }
  }

  private async validateCredentialEmailUniqueness(
    email: string,
    ignoredCredentialId?: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: credentials.id })
      .from(credentials)
      .where(
        ignoredCredentialId
          ? and(
              eq(credentials.email, email),
              ne(credentials.id, ignoredCredentialId),
            )
          : eq(credentials.email, email),
      )
      .limit(1);

    if (existing) {
      throw new AppException(ErrorCode.E003, HttpStatus.CONFLICT);
    }
  }

  private async generateUserCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: count() }).from(users);
    return `NV${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
