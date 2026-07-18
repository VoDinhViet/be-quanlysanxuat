import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';

/** Lists material groups. Inherits `limit`/`page`/`q`/`order`; `q` matches `code`/`name`. */
export class GetMaterialGroupsReqDto extends PageOptionsDto {}
