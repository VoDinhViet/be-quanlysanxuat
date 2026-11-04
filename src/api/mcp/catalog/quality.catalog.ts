import { IqcController } from '../../iqc/iqc.controller';
import { NcrsController } from '../../ncrs/ncrs.controller';
import { OqcController } from '../../oqc/oqc.controller';
import { defineMcpTool } from './define-mcp-tool';

export const QUALITY_TOOLS = [
  defineMcpTool({
    name: 'quality_iqc_list',
    title: 'Danh sách phiếu IQC',
    hint: 'Incoming quality checks (IQC) filtered by supplier, customer, result, disposition or status',
    controller: IqcController,
    method: 'getIqcs',
  }),
  defineMcpTool({
    name: 'quality_iqc_get',
    title: 'Chi tiết phiếu IQC',
    hint: 'One incoming quality check (IQC) by iqcId, with inspection results',
    controller: IqcController,
    method: 'getIqc',
  }),
  defineMcpTool({
    name: 'quality_iqc_stats',
    title: 'Thống kê IQC',
    hint: 'IQC counts: total, not inspected, PASS, FAIL, pending, returned to supplier, done',
    controller: IqcController,
    method: 'getIqcStats',
  }),
  defineMcpTool({
    name: 'quality_iqc_inspection_rate_stats',
    title: 'Thống kê kết quả kiểm IQC',
    hint: 'Completed incoming quality checks (IQC) counted by result, grouped by decision, day (newest first) or supplier',
    controller: IqcController,
    method: 'getIqcInspectionRate',
  }),
  defineMcpTool({
    name: 'quality_iqc_supplier_fail_rate_list',
    title: 'Tỉ lệ IQC không đạt theo nhà cung cấp',
    hint: 'Suppliers ranked by IQC fail rate over recent days, only those with enough inspections and at least one failure',
    controller: IqcController,
    method: 'getIqcSupplierFailRate',
  }),
  defineMcpTool({
    name: 'quality_iqc_open_failure_list',
    title: 'Phiếu kiểm không đạt còn mở',
    hint: 'Failed incoming quality checks (IQC) not yet completed or lacking a disposition, with their age in days',
    controller: IqcController,
    method: 'getOpenIqcFailures',
  }),
  defineMcpTool({
    name: 'quality_oqc_list',
    title: 'Danh sách phiếu OQC',
    hint: 'Outgoing quality checks (OQC) of finished lots filtered by JOB, operation, item, result, status or date',
    controller: OqcController,
    method: 'getOqcs',
  }),
  defineMcpTool({
    name: 'quality_oqc_get',
    title: 'Chi tiết phiếu OQC',
    hint: 'One outgoing quality check (OQC) by oqcId, with inspection results',
    controller: OqcController,
    method: 'getOqc',
  }),
  defineMcpTool({
    name: 'quality_ncr_list',
    title: 'Danh sách phiếu không phù hợp (NCR)',
    hint: 'Non-conformance reports (NCR) filtered by status, type (internal or customer), department or customer',
    controller: NcrsController,
    method: 'getNcrs',
  }),
  defineMcpTool({
    name: 'quality_ncr_get',
    title: 'Chi tiết phiếu không phù hợp (NCR)',
    hint: 'One non-conformance report (NCR) by ncrId, with its disposition and follow-up',
    controller: NcrsController,
    method: 'getNcr',
  }),
  defineMcpTool({
    name: 'quality_ncr_operation_list',
    title: 'Công đoạn chọn để xử lý NCR',
    hint: 'Operations of the affected product to pick for rework, by ncrId',
    controller: NcrsController,
    method: 'getNcrOperations',
  }),
];
