import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentReqDto } from './dto/create-department.req.dto';
import { DepartmentDetailResDto } from './dto/department-detail.res.dto';
import { DepartmentResDto } from './dto/department.res.dto';
import { GetDepartmentsReqDto } from './dto/get-departments.req.dto';
import { UpdateDepartmentReqDto } from './dto/update-department.req.dto';

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiPublic({
    type: DepartmentDetailResDto,
    summary: 'List departments',
    isPaginated: true,
  })
  getDepartments(
    @Query() reqDto: GetDepartmentsReqDto,
  ): Promise<OffsetPaginatedDto<DepartmentDetailResDto>> {
    return this.departmentsService.getDepartments(reqDto);
  }

  @Get(':departmentId')
  @ApiPublic({
    type: DepartmentDetailResDto,
    summary: 'Get department detail',
  })
  getDepartment(
    @UUIDParam('departmentId') departmentId: string,
  ): Promise<DepartmentDetailResDto> {
    return this.departmentsService.getDepartment(departmentId);
  }

  @Post()
  @Permissions('departments:create')
  @ApiAuth({
    type: DepartmentResDto,
    summary: 'Create department',
  })
  createDepartment(
    @Body() reqDto: CreateDepartmentReqDto,
  ): Promise<DepartmentResDto> {
    return this.departmentsService.createDepartment(reqDto);
  }

  @Patch(':departmentId')
  @Permissions('departments:update')
  @ApiAuth({
    type: DepartmentResDto,
    summary: 'Update department',
  })
  updateDepartment(
    @UUIDParam('departmentId') departmentId: string,
    @Body() reqDto: UpdateDepartmentReqDto,
  ): Promise<DepartmentResDto> {
    return this.departmentsService.updateDepartment(departmentId, reqDto);
  }

  @Delete(':departmentId')
  @Permissions('departments:delete')
  @ApiAuth({
    summary: 'Delete department',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteDepartment(
    @UUIDParam('departmentId') departmentId: string,
  ): Promise<void> {
    return this.departmentsService.deleteDepartment(departmentId);
  }
}
