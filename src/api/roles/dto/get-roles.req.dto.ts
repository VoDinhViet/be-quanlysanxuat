import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';

/**
 * Lists roles. Inherits `limit`/`page`/`q`/`order` from `PageOptionsDto`; `q` matches role
 * `code`/`name`. No extra filters yet.
 */
export class GetRolesReqDto extends PageOptionsDto {}
