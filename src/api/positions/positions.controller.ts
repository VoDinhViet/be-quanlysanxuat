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
import { CreatePositionReqDto } from './dto/create-position.req.dto';
import { GetPositionsReqDto } from './dto/get-positions.req.dto';
import { PositionResDto } from './dto/position.res.dto';
import { UpdatePositionReqDto } from './dto/update-position.req.dto';
import { PositionsService } from './positions.service';

@ApiTags('Positions')
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @ApiPublic({
    type: PositionResDto,
    summary: 'List positions',
    isPaginated: true,
  })
  getPositions(
    @Query() reqDto: GetPositionsReqDto,
  ): Promise<OffsetPaginatedDto<PositionResDto>> {
    return this.positionsService.getPositions(reqDto);
  }

  @Post()
  @Permissions('positions:create')
  @ApiAuth({
    summary: 'Create position',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createPosition(@Body() reqDto: CreatePositionReqDto): Promise<void> {
    return this.positionsService.createPosition(reqDto);
  }

  @Patch(':positionId')
  @Permissions('positions:update')
  @ApiAuth({
    summary: 'Update position',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updatePosition(
    @UUIDParam('positionId') positionId: string,
    @Body() reqDto: UpdatePositionReqDto,
  ): Promise<void> {
    return this.positionsService.updatePosition(positionId, reqDto);
  }

  @Delete(':positionId')
  @Permissions('positions:delete')
  @ApiAuth({
    summary: 'Delete position',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deletePosition(@UUIDParam('positionId') positionId: string): Promise<void> {
    return this.positionsService.deletePosition(positionId);
  }
}
