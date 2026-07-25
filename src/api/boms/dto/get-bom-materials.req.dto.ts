import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';

/**
 * Lists a BOM's materials, aggregated per material. Inherits `limit`/`page`/`q`/`order`; `q`
 * fuzzy-matches the linked material's code/name.
 */
export class GetBomMaterialsReqDto extends PageOptionsDto {}
