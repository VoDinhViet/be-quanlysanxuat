import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';

/** Query cho `GET /production-jobs/:jobId/logs` — chỉ phân trang, chưa cần filter riêng. */
export class GetProductionJobLogsReqDto extends PageOptionsDto {}
