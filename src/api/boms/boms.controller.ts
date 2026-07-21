import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { BomItemResDto } from './dto/bom-item.res.dto';
import { BomsService } from './boms.service';

// Path is a plain literal string prefix (not `RouterModule`), consistent with
// ProductRevisionsController — this just nests one level deeper.
@ApiTags('Boms')
@Controller('products/:productId/revisions/:revisionId/bom')
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: BomItemResDto,
    summary: "Get a product revision's BOM tree (Cấu trúc sản phẩm)",
    isArray: true,
  })
  getBom(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
  ): Promise<BomItemResDto[]> {
    return this.bomsService.getBomTree(productId, revisionId);
  }
}
