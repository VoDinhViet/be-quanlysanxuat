export type SelectedOperations<T> = {
  operations: T[];
  nextOperationName: string | null;
};

/** `operations` đã sắp theo thứ tự chạy của một Part. Có `operationId` → chỉ giữ các bước khớp và
 * `nextOperationName` là bước liền sau bước khớp CUỐI CÙNG (null nếu nó là bước cuối) — bước kế
 * tiếp phải đọc trước khi lọc bỏ các bước khác. Không có `operationId` → trả nguyên danh sách. */
export function selectOperations<
  T extends { operationId: string | null; name: string },
>(operations: T[], operationId?: string): SelectedOperations<T> {
  if (!operationId) {
    return { operations, nextOperationName: null };
  }

  const lastMatchIndex = operations.findLastIndex(
    (operation) => operation.operationId === operationId,
  );

  return {
    operations: operations.filter(
      (operation) => operation.operationId === operationId,
    ),
    nextOperationName:
      lastMatchIndex === -1
        ? null
        : (operations.at(lastMatchIndex + 1)?.name ?? null),
  };
}
