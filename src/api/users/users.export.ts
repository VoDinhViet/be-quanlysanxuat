import {
  formatExcelDate,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { UserGender, UserStatus } from '../../database/schemas';

export interface UserExport {
  code: string;
  fullName: string;
  gender: UserGender;
  dateOfBirth: Date | null;
  idNumber: string | null;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  departmentName: string;
  positionName: string;
  roleName: string | null;
  hireDate: Date;
  status: UserStatus;
  note: string | null;
}

const USER_GENDER_LABELS: Record<UserGender, string> = {
  [UserGender.MALE]: 'Nam',
  [UserGender.FEMALE]: 'Nữ',
  [UserGender.OTHER]: 'Khác',
};

const USER_STATUS_LABELS: Record<UserStatus, string> = {
  [UserStatus.WORKING]: 'Đang làm việc',
  [UserStatus.RESIGNED]: 'Đã nghỉ việc',
};

export const USER_EXPORT_COLUMNS: ExcelColumn<UserExport>[] = [
  { header: 'Mã nhân viên', value: (row) => row.code },
  { header: 'Họ và tên', value: (row) => row.fullName, width: 25 },
  {
    header: 'Giới tính',
    value: (row) => USER_GENDER_LABELS[row.gender],
    width: 12,
  },
  { header: 'Ngày sinh', value: (row) => formatExcelDate(row.dateOfBirth) },
  { header: 'CCCD/CMND', value: (row) => row.idNumber },
  { header: 'Số điện thoại', value: (row) => row.phoneNumber },
  { header: 'Email', value: (row) => row.email, width: 28 },
  { header: 'Địa chỉ', value: (row) => row.address, width: 35 },
  { header: 'Phòng ban', value: (row) => row.departmentName, width: 25 },
  { header: 'Chức vụ', value: (row) => row.positionName, width: 25 },
  { header: 'Vai trò', value: (row) => row.roleName },
  { header: 'Ngày vào làm', value: (row) => formatExcelDate(row.hireDate) },
  {
    header: 'Trạng thái',
    value: (row) => USER_STATUS_LABELS[row.status],
    width: 14,
  },
  { header: 'Ghi chú', value: (row) => row.note, width: 30 },
];
