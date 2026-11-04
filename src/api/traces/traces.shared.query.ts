import { sql } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';

import type { TraceStep } from './traces.constant';

/** Một chứng từ trên đường truy vết; `parentCode` là mã chứng từ cha mà nó nối vào. */
export type TraceStepNode = {
  step: TraceStep;
  code: string | null;
  status: string | null;
  dueDate: string | null;
  quantity: number | null;
  parentCode: string | null;
  note: string | null;
};

// `id` để bước sau tra tiếp, không trả ra ngoài
export type TraceStepRow = TraceStepNode & { id: string };

export const NO_TEXT = sql<string | null>`null::text`;
export const NO_NUMBER = sql<number | null>`null::float8`;

export const toStep = (value: TraceStep) => sql<TraceStep>`${value}::text`;

/** Tổng số lượng chỉ có nghĩa khi chứng từ có một mặt hàng; nhiều mặt hàng khác đơn vị thì bỏ trống. */
export const singleItemQuantity = (quantity: AnyColumn, item: AnyColumn) =>
  sql<
    number | null
  >`case when count(distinct ${item}) = 1 then sum(${quantity})::float8 end`;

export function toStepNodes(stepRows: TraceStepRow[]): TraceStepNode[] {
  return stepRows.map((stepRow) => ({
    step: stepRow.step,
    code: stepRow.code,
    status: stepRow.status,
    dueDate: stepRow.dueDate,
    quantity: stepRow.quantity,
    parentCode: stepRow.parentCode,
    note: stepRow.note,
  }));
}

export function toStepIds(stepRows: TraceStepRow[]): string[] {
  return stepRows.map((stepRow) => stepRow.id);
}
