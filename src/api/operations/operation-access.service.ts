import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { SUPER_PERMISSION } from '../../constants/permission.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  operationAssignments,
  operations,
  OperationStatus,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { PermissionsService } from '../auth/permissions.service';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';

/** Phạm vi công đoạn của người dùng ở màn "Thực hiện sản xuất": RBAC (`production-execution:read-all`)
 * kết hợp phân công (`operation_assignments`). */
@Injectable()
export class OperationAccessService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** `null` = không giới hạn (Super Admin hoặc có `production-execution:read-all`); ngược lại là
   * các công đoạn còn hoạt động được phân công cho họ — rỗng nghĩa là chưa được phân công, không
   * thấy gì. */
  async getAllowedOperationIds(
    payload: JwtPayloadType,
  ): Promise<string[] | null> {
    const granted = await this.permissionsService.getPermissionCodes(
      payload.sub,
    );

    if (
      granted.includes(SUPER_PERMISSION) ||
      granted.includes('production-execution:read-all')
    ) {
      return null;
    }

    const assigned = await this.db
      .select({ operationId: operationAssignments.operationId })
      .from(operationAssignments)
      .innerJoin(
        operations,
        and(
          eq(operations.id, operationAssignments.operationId),
          isNull(operations.deletedAt),
          eq(operations.status, OperationStatus.ACTIVE),
        ),
      )
      .where(eq(operationAssignments.userId, payload.userId));

    return assigned.map((row) => row.operationId);
  }

  /** Một công đoạn cụ thể phải nằm trong phạm vi của người dùng, nếu không → 403 (E279). */
  async assertCanAccess(
    payload: JwtPayloadType,
    operationId: string | null,
  ): Promise<void> {
    this.assertOperationAllowed(
      await this.getAllowedOperationIds(payload),
      operationId,
    );
  }

  assertOperationAllowed(
    allowedOperationIds: string[] | null,
    operationId: string | null,
  ): void {
    if (
      allowedOperationIds &&
      (!operationId || !allowedOperationIds.includes(operationId))
    ) {
      throw new AppException(ErrorCode.E279, HttpStatus.FORBIDDEN);
    }
  }
}
