/**
 * Tiến độ của một công đoạn trên một Job (gộp qua mọi Part của Job có công đoạn đó) — tính lúc
 * đọc, không lưu cột nào nên không cần `pgEnum`. Cách suy: `docs/workflows/production-job-execution.md`.
 * `DONE` (không phải `COMPLETED`) — khớp giá trị FE `ProductionOperationProgressStatus` đã định
 * nghĩa trước (`web-qlsx-start/src/lib/types/production-job.type.ts`). `OVERDUE` = chưa xong mà
 * hạn hoàn thành (muộn nhất qua các Part) đã qua — ưu tiên hơn `NOT_STARTED`/`IN_PROGRESS`.
 * `IN_PROGRESS` gồm cả Job đang sản xuất (`production_jobs.status = IN_PROGRESS`) dù công đoạn
 * chưa ai báo cáo — `NOT_STARTED` chỉ còn cho Job đã qua giai đoạn đó mà chưa có sản lượng.
 */
export enum JobOperationProgress {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  OVERDUE = 'OVERDUE',
}

/**
 * Đánh giá đúng/trễ hạn của một công đoạn đã xong — `null` khi chưa xong hoặc không có hạn hoàn
 * thành để so. Tính lúc đọc, không lưu.
 */
export enum JobOperationEvaluation {
  ON_TIME = 'ON_TIME',
  LATE = 'LATE',
}
