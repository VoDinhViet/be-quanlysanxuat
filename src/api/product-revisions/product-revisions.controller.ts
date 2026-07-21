import { Body, Controller, Get, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { ProductRevisionResDto } from './dto/product-revision.res.dto';
import { UpdateProductRevisionReqDto } from './dto/update-product-revision.req.dto';
import { ProductRevisionsService } from './product-revisions.service';

// Path is a plain literal string prefix (not `RouterModule`) — the repo has no nested-controller
// precedent yet and this is the only nested resource so far; revisit if more accumulate.
@ApiTags('Product Revisions')
@Controller('products/:productId/revisions')
export class ProductRevisionsController {
  constructor(private readonly productRevisionsService: ProductRevisionsService) {}

  @Get()
  @Permissions('products:read')
  @ApiPublic({
    type: ProductRevisionResDto,
    summary: 'List a product’s revision history',
    isArray: true,
  })
  getRevisions(@UUIDParam('productId') productId: string): Promise<ProductRevisionResDto[]> {
    return this.productRevisionsService.getRevisions(productId);
  }

  @Get(':revisionId')
  @Permissions('products:read')
  @ApiPublic({
    type: ProductRevisionResDto,
    summary: 'Get revision detail',
  })
  getRevisionDetail(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
  ): Promise<ProductRevisionResDto> {
    return this.productRevisionsService.getRevisionDetail(productId, revisionId);
  }

  @Post()
  @Permissions('products:revisions-manage')
  @ApiAuth({
    type: ProductRevisionResDto,
    summary:
      'Create a new revision ("Tạo revision mới"), branched from an existing one — current by default',
    statusCode: HttpStatus.CREATED,
  })
  createRevision(
    @UUIDParam('productId') productId: string,
    @Body() reqDto: CreateProductRevisionReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<ProductRevisionResDto> {
    return this.productRevisionsService.createRevision(productId, reqDto, payload.sub);
  }

  @Patch(':revisionId')
  @Permissions('products:revisions-manage')
  @ApiAuth({
    type: ProductRevisionResDto,
    summary: 'Update a revision’s basic info (Mã Revision, Ghi chú)',
  })
  updateRevision(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
    @Body() reqDto: UpdateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    return this.productRevisionsService.updateRevision(productId, revisionId, reqDto);
  }

  @Post(':revisionId/activate')
  @Permissions('products:revisions-manage')
  @ApiAuth({
    type: ProductRevisionResDto,
    summary: 'Switch the product’s current revision to this one (rollback/switch)',
  })
  activateRevision(
    @UUIDParam('productId') productId: string,
    @UUIDParam('revisionId') revisionId: string,
  ): Promise<ProductRevisionResDto> {
    return this.productRevisionsService.activateRevision(productId, revisionId);
  }
}
