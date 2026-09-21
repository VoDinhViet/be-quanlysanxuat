/**
 * Tiến độ của một công đoạn trên một Job (gộp qua mọi Part của Job có công đoạn đó) — tính lúc
 * đọc, không lưu cột nào nên không cần `pgEnum`. Cách suy: `docs/workflows/production-job-execution.md`.
 * `DONE` (không phải `COMPLETED`) — khớp giá trị FE `ProductionOperationProgressStatus` đã định
 * nghĩa trước (`web-qlsx-start/src/lib/types/production-job.type.ts`).
 */
export enum JobOperationProgress {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}
