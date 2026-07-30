import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';

/** Query cho `GET /production-orders/:productionOrdersId/logs` — chỉ phân trang, chưa cần filter riêng. */
export class GetProductionOrderLogsReqDto extends PageOptionsDto {}
