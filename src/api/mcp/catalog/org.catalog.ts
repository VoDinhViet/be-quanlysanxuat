import { CountriesController } from '../../countries/countries.controller';
import { DepartmentsController } from '../../departments/departments.controller';
import { PositionsController } from '../../positions/positions.controller';
import { RolesController } from '../../roles/roles.controller';
import { UsersController } from '../../users/users.controller';
import { defineMcpTool } from './define-mcp-tool';

export const ORG_TOOLS = [
  defineMcpTool({
    name: 'org_me_get',
    title: 'Hồ sơ của tôi',
    hint: 'Profile of the employee the agent is acting for',
    controller: UsersController,
    method: 'getCurrentUser',
  }),
  defineMcpTool({
    name: 'org_my_permission_list',
    title: 'Quyền của tôi',
    hint: 'Effective permissions of the employee the agent is acting for; use it to explain why a tool is missing',
    controller: UsersController,
    method: 'getCurrentPermissions',
  }),
  defineMcpTool({
    name: 'org_user_list',
    title: 'Danh sách nhân viên',
    hint: 'Employees; use it to get a userId for requester or assignee filters',
    controller: UsersController,
    method: 'getUsers',
  }),
  defineMcpTool({
    name: 'org_user_get',
    title: 'Chi tiết nhân viên',
    hint: 'One employee by userId',
    controller: UsersController,
    method: 'getUser',
  }),
  defineMcpTool({
    name: 'org_department_list',
    title: 'Danh sách phòng ban',
    hint: 'Departments; use it to get a departmentId for filters',
    controller: DepartmentsController,
    method: 'getDepartments',
  }),
  defineMcpTool({
    name: 'org_department_get',
    title: 'Chi tiết phòng ban',
    hint: 'One department by departmentId',
    controller: DepartmentsController,
    method: 'getDepartment',
  }),
  defineMcpTool({
    name: 'org_position_list',
    title: 'Danh sách chức vụ',
    hint: 'Positions, each belonging to one department',
    controller: PositionsController,
    method: 'getPositions',
  }),
  defineMcpTool({
    name: 'org_country_list',
    title: 'Danh sách quốc gia',
    hint: 'Countries, for filtering suppliers by countryId',
    controller: CountriesController,
    method: 'getCountries',
  }),
  defineMcpTool({
    name: 'org_role_list',
    title: 'Danh sách vai trò',
    hint: 'Roles and the permissions they grant',
    controller: RolesController,
    method: 'getRoles',
  }),
  defineMcpTool({
    name: 'org_role_get',
    title: 'Chi tiết vai trò',
    hint: 'One role by roleId, with its permission codes',
    controller: RolesController,
    method: 'getRole',
  }),
  defineMcpTool({
    name: 'org_permission_catalog_get',
    title: 'Danh mục quyền',
    hint: 'Every permission code the system defines, grouped for the role matrix',
    controller: RolesController,
    method: 'getPermissionCatalogue',
  }),
];
