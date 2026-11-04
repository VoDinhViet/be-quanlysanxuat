import { ReportsController } from '../../reports/reports.controller';
import { defineMcpTool } from './define-mcp-tool';

export const REPORT_TOOLS = [
  defineMcpTool({
    name: 'report_factory_summary',
    title: 'Tổng quan nhà máy',
    hint: 'Factory KPIs for sales orders, production and QC; without a date range it also returns trends',
    controller: ReportsController,
    method: 'getStats',
  }),
  defineMcpTool({
    name: 'report_alert_summary',
    title: 'Cảnh báo cần xử lý',
    hint: 'Dashboard counts of four alerts: overdue JOBs, overdue outsourcing orders (OS-OUT), unresolved NCR and delivery orders (DO) coming due; no date filter',
    controller: ReportsController,
    method: 'getAlerts',
  }),
  defineMcpTool({
    name: 'report_overdue_job_list',
    title: 'JOB sắp hoặc đã quá hạn',
    hint: 'Dashboard widget: the 5 most overdue JOBs, no filter; use production_job_late_operation_list for overdue operations with filters',
    controller: ReportsController,
    method: 'getJobDueDate',
  }),
  defineMcpTool({
    name: 'report_overdue_outsourcing_order_list',
    title: 'Phiếu gia công ngoài sắp hoặc đã quá hạn',
    hint: 'Dashboard widget: the 5 most overdue outsourcing orders (OS-OUT), no filter; use production_outsourcing_order_overdue_list for the filtered list',
    controller: ReportsController,
    method: 'getOutsourcingOrderDueDate',
  }),
  defineMcpTool({
    name: 'report_qc_pass_rate_stats',
    title: 'Tỷ lệ đạt QC 7 ngày',
    hint: 'IQC and OQC pass rate for each of the last 7 days',
    controller: ReportsController,
    method: 'getQcPassRate',
  }),
  defineMcpTool({
    name: 'report_production_progress_stats',
    title: 'Tiến độ sản xuất',
    hint: 'Number of JOBs per status, optionally within a date range',
    controller: ReportsController,
    method: 'getProductionProgress',
  }),
  defineMcpTool({
    name: 'report_pending_approval_summary',
    title: 'Việc đang chờ tôi xử lý',
    hint: 'Counts of documents waiting for the signed-in employee to approve, post or submit; modules they cannot act on count 0',
    controller: ReportsController,
    method: 'getPendingApprovals',
  }),
];
