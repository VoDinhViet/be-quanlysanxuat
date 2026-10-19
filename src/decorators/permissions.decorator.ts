import { SetMetadata } from '@nestjs/common';

import type { PermissionCode } from '../constants/permission.constant';

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PERMISSIONS_BY_PARAM_KEY = 'permissionsByParam';

export interface PermissionsByParamRule {
  param: string;
  permissionByValue: Record<string, PermissionCode | PermissionCode[]>;
}

/**
 * Quyền phụ thuộc giá trị của một tham số query (route gộp nhiều thực thể). Cộng với `@Permissions`
 * của cùng route; giá trị cần nhiều miền thì khai mảng quyền. Giá trị không có trong bảng thì route
 * bị từ chối (mặc định đóng).
 */
export const PermissionsByParam = (
  param: string,
  permissionByValue: Record<string, PermissionCode | PermissionCode[]>,
) =>
  SetMetadata<string, PermissionsByParamRule>(PERMISSIONS_BY_PARAM_KEY, {
    param,
    permissionByValue,
  });
