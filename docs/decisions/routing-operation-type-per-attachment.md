# `type` (Inhouse/Outsource) là quyết định per-attachment, không phải catalog

**Trạng thái:** còn hiệu lực

## Bối cảnh

Báo lỗi thực tế: chọn "Gia công ngoài" khi thêm 1 công đoạn vào routing/BOM sản phẩm, nhưng dòng
vừa thêm lại hiện "Trong nhà". Nguyên nhân: `type` trước đây chỉ tồn tại trên bảng danh mục
`operations` (comment cũ trong `operations.ts` khẳng định — sai — đây là "the master flag", và
"No routing/BOM step overrides this value"). FE (`ProductOperationsPanel.tsx`) đã đúng từ đầu — có
sẵn Select chọn Inhouse/Outsource lúc gắn công đoạn vào routing/BOM, gửi `type` lên
`POST /items/:id/operations` và `POST /items/:id/bom/items/:bomItemId/operations` — nhưng
`CreateRoutingOperationReqDto`/`CreateBomOperationReqDto` không có field `type` nào cả,
`whitelist: true` âm thầm loại bỏ nó. Dòng vừa thêm hiện `operation.type` (danh mục), luôn mặc định
`INHOUSE` vì không có UI nào tạo được công đoạn danh mục kiểu `OUTSOURCE`.

Bug này còn cháy lan xuống sản xuất thật: `ProductionJobsService.copyBomTree`/
`copyFinalAssemblyRouting` (lúc duyệt LSX) copy `type` cho `production_job_operations` từ
`step.operation.type` (danh mục, luôn INHOUSE) thay vì từ chính dòng `bom_operations`/
`routing_operations` — nghĩa là **mọi Job sinh ra trước bản vá này đều có công đoạn `INHOUSE`, kể
cả khi routing/BOM đã ghi rõ `OUTSOURCE`** — ảnh hưởng trực tiếp `OutsourcingOrdersService
.getOutsourceableOperations` (lọc `productionJobOperations.type = OUTSOURCE` để hiện "part cần gia
công").

## Quyết định

`type` là thuộc tính của **từng lần gắn công đoạn vào routing Cấp 0 hoặc BOM item**
(`routing_operations.type`, `bom_operations.type`) — cùng công đoạn danh mục có thể là Inhouse ở
routing này, Outsource ở BOM node khác. `operations.type` (danh mục) **vẫn giữ lại** — không phải
"nguồn sự thật" nữa, chỉ còn 2 vai trò:

1. Giá trị mặc định (INHOUSE) prefill cho Select lúc gắn — người dùng có thể đổi khác lúc gắn.
2. Cờ mà màn danh mục "Gia công ngoài" lọc theo (`GET /operations?type=OUTSOURCE`) — không đổi.

### Các chỗ đã sửa

| File                                                           | Trước                                  | Sau                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `routing_operations`/`bom_operations` (schema)                 | Không có cột `type`                    | Thêm `type` (`operationTypeEnum`, default `INHOUSE`, migration `0173`)                                                            |
| `CreateRoutingOperationReqDto`/`CreateBomOperationReqDto`      | Không nhận `type`                      | Nhận `type?` optional, default DB nếu bỏ trống                                                                                    |
| `UpdateRoutingOperationReqDto`/`UpdateBomOperationReqDto`      | Không nhận `type`                      | Nhận `type?`                                                                                                                      |
| `RoutingOperationResDto`/`BomOperationResDto`                  | Không trả `type` riêng                 | Trả `type` ở top-level (của chính bước), tách khỏi `operation.type` (danh mục, vẫn còn trong `OperationRefResDto` lồng bên trong) |
| `ProductionJobsService.copyBomTree`/`copyFinalAssemblyRouting` | `type: step.operation.type` (danh mục) | `type: step.type` (chính dòng `bom_operations`/`routing_operations`)                                                              |

**Không đụng**: `operations.type`/`operations.service.ts` (danh mục CRUD + filter, vẫn đúng vai
trò); `production_job_operations.type` (đã đúng thiết kế từ trước — chỉ nguồn copy sai, đã sửa);
`OutsourcingOrdersService.getOutsourceableOperations` (đã lọc đúng cột, chỉ cần nguồn copy đúng).

**Cố ý để ngoài phạm vi**: `ProductionExecutionService.getOperations()` (màn "Thực hiện sản xuất",
danh sách công đoạn kèm số Job) vẫn hiện `operations.type` (danh mục) vì nhóm theo `operations.id`
— giờ 1 công đoạn danh mục có thể ứng với nhiều Job mang `type` per-attachment khác nhau, không có
cách gộp về 1 giá trị đúng mà không đổi hẳn cách nhóm của view này. Chấp nhận hiển thị gợi ý mặc
định ở đây, không phải giá trị thật từng Job.

## Data đã tồn tại trước bản vá

Migration `0173` set `type = INHOUSE` cho mọi dòng `routing_operations`/`bom_operations` hiện có
(default, không có cách suy ngược type thật đã định lúc tạo vì chưa từng lưu). Ai đã gắn công đoạn
Outsource trước bản vá này cần vào sửa lại thủ công qua `PATCH` (đã hỗ trợ `type`). Các Job **đã**
duyệt trước bản vá giữ nguyên `production_job_operations.type = INHOUSE` bị ghi sai — không tự sửa
hồi tố, cần rà tay Job nào lẽ ra phải Outsource.

## Đừng hoàn lại

- Đừng gỡ `type` khỏi `routing_operations`/`bom_operations` — đó chính là chỗ dữ liệu cần sống,
  không phải `operations`.
- Đừng đổi `copyBomTree`/`copyFinalAssemblyRouting` về đọc `step.operation.type` — quay lại đúng
  bug này.
- Đừng xoá `operations.type` — màn danh mục "Gia công ngoài" vẫn lọc theo nó, và nó vẫn là giá trị
  mặc định hợp lý lúc gắn mới.

## Related docs

`docs/decisions/oqc-per-operation.md`, `docs/domains/production.md`.
