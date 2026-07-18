import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiPublic } from '../../decorators/http.decorators';
import { DepartmentsService } from './departments.service';
import { DepartmentResDto } from './dto/department.res.dto';
import { GetDepartmentsReqDto } from './dto/get-departments.req.dto';

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @ApiPublic({
    type: DepartmentResDto,
    summary: 'List departments',
    isPaginated: true,
  })
  getDepartments(
    @Query() reqDto: GetDepartmentsReqDto,
  ): Promise<OffsetPaginatedDto<DepartmentResDto>> {
    return this.departmentsService.getDepartments(reqDto);
  }
}
