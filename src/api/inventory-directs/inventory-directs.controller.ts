import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { XLSX_MIME } from '../../common/utils/excel.util';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { GetInventoryDirectsReqDto } from './dto/get-inventory-directs.req.dto';
import { ImportInventoryDirectReqDto } from './dto/import-inventory-direct.req.dto';
import { InventoryDirectImportResDto } from './dto/inventory-direct-import.res.dto';
import { InventoryDirectResDto } from './dto/inventory-direct.res.dto';
import { InventoryDirectImportService } from './inventory-direct-import.service';
import { InventoryDirectsService } from './inventory-directs.service';

@ApiTags('Inventory Directs')
@Controller('inventory-directs')
export class InventoryDirectsController {
  constructor(
    private readonly inventoryDirectsService: InventoryDirectsService,
    private readonly inventoryDirectImportService: InventoryDirectImportService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  @ApiAuth({
    type: InventoryDirectResDto,
    summary: 'Tồn kho vật tư (onHand/reserved/bomDemand/available/status)',
    isPaginated: true,
  })
  getInventoryDirects(
    @Query() reqDto: GetInventoryDirectsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryDirectResDto>> {
    return this.inventoryDirectsService.getInventoryDirects(reqDto);
  }

  @Get('import-template')
  @Permissions('inventory:import')
  @ApiAuth({
    summary: 'Tải file Excel mẫu nhập tồn kho, điền sẵn vật tư và tồn hiện tại',
    fileType: XLSX_MIME,
  })
  downloadImportTemplate(): Promise<StreamableFile> {
    return this.inventoryDirectImportService.downloadImportTemplate();
  }

  @Post('import')
  @Permissions('inventory:import')
  @ApiAuth({
    type: InventoryDirectImportResDto,
    summary:
      'Nhập tồn thực tế từ Excel — sinh phiếu điều chỉnh kiểm kê và ghi sổ ngay; tất cả hoặc không',
  })
  importStock(
    @Body() reqDto: ImportInventoryDirectReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<InventoryDirectImportResDto> {
    return this.inventoryDirectImportService.importStock(
      reqDto,
      payload.userId,
    );
  }
}
