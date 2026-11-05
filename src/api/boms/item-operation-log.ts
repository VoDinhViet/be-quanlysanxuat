import {
  ItemOperationLogAction,
  ItemOperationStepLevel,
  type itemOperationLogs,
  type OperationType,
} from '../../database/schemas';

/** Công đoạn đang được ghi log. Có `bomItemId` là công đoạn của Part, không có là công đoạn Cấp 0. */
type LoggedStep = {
  id: string;
  operationId: string;
  operationCode: string;
  operationName: string;
  type: OperationType;
  sortOrder: number;
  note: string | null;
  bomItemId?: string;
  partCode?: string | null;
};

type LoggedEvent =
  | {
      action: ItemOperationLogAction.CREATED | ItemOperationLogAction.DELETED;
    }
  | { action: ItemOperationLogAction.COPIED; sourceItemCode: string }
  | { action: ItemOperationLogAction.UPDATED; changes: string }
  | {
      action: ItemOperationLogAction.DELETED_WITH_PART;
      deletedPartCode: string | null;
    };

type StepChanges = {
  type?: OperationType;
  sortOrder?: number;
  note?: string | null;
};

/** Mọi dòng `item_operation_logs` dựng ở đây để câu log và cột phân loại luôn khớp nhau. */
export function buildItemOperationLog(
  params: LoggedEvent & {
    itemId: string;
    step: LoggedStep;
    performedBy: string;
  },
): typeof itemOperationLogs.$inferInsert {
  const { itemId, step, performedBy, action } = params;

  return {
    itemId,
    action,
    stepLevel: step.bomItemId
      ? ItemOperationStepLevel.PART
      : ItemOperationStepLevel.ROUTING,
    stepId: step.id,
    operationId: step.operationId,
    bomItemId: step.bomItemId,
    content: describeEvent(params, step),
    performedBy,
  };
}

/** Trả `null` khi không trường nào đổi giá trị, để không ghi log rỗng. */
export function describeStepChanges(
  step: Pick<LoggedStep, 'type' | 'sortOrder' | 'note'>,
  changes: StepChanges,
): string | null {
  const changeDescriptions: string[] = [];

  if (changes.sortOrder !== undefined && changes.sortOrder !== step.sortOrder) {
    changeDescriptions.push(`STT ${step.sortOrder} → ${changes.sortOrder}`);
  }
  if (changes.type !== undefined && changes.type !== step.type) {
    changeDescriptions.push(`loại ${step.type} → ${changes.type}`);
  }
  if (changes.note !== undefined && changes.note !== step.note) {
    changeDescriptions.push(
      `ghi chú "${step.note ?? ''}" → "${changes.note ?? ''}"`,
    );
  }

  return changeDescriptions.length > 0 ? changeDescriptions.join('; ') : null;
}

function describeEvent(event: LoggedEvent, step: LoggedStep): string {
  const operationName = `${step.operationCode} - ${step.operationName}`;
  const noteSuffix = step.note ? `, ghi chú: ${step.note}` : '';
  const operationDetail = `${operationName} (STT ${step.sortOrder}, ${step.type}${noteSuffix})`;
  const location = step.bomItemId ? `Part ${step.partCode}` : 'Cấp 0';

  switch (event.action) {
    case ItemOperationLogAction.CREATED:
      return `Thêm công đoạn ${operationDetail} vào ${location}`;
    case ItemOperationLogAction.COPIED:
      return `Sao chép công đoạn ${operationDetail} vào ${location} từ sản phẩm ${event.sourceItemCode}`;
    case ItemOperationLogAction.UPDATED:
      return `Sửa công đoạn ${operationName} ở ${location}: ${event.changes}`;
    case ItemOperationLogAction.DELETED:
      return `Xoá công đoạn ${operationDetail} khỏi ${location}`;
    case ItemOperationLogAction.DELETED_WITH_PART:
      return `Xoá công đoạn ${operationDetail} của ${location} do xoá Part ${event.deletedPartCode}`;
  }
}
