# `.claude/` — quy ước rule & skill của dự án

Tài liệu này giải thích cách dự án tổ chức cấu hình dành cho Claude Code. Không `@import` vào `CLAUDE.md` — chỉ đọc khi cần thêm/sửa một rule hoặc skill, không load ở mỗi phiên làm việc.

## Rule vs Skill — khi nào dùng cái nào

- **Rule** (`.claude/rules/*.md`): convention áp dụng cho **gần như mọi task code** trong repo — vi phạm là bug, không phải "quên dùng công cụ". Đặt tên theo **thứ đang sửa**, không theo loại task. 6/8 file luôn `@import` vào `CLAUDE.md` (`general`, `documentation`, `api`, `service`, `database`, `security`); 2 file còn lại **không** import, chỉ đọc đúng lúc rơi vào tình huống đó — mỗi file có một dòng trỏ tới nó nằm trong rule đã import quản lý khoảnh khắc đó: `transactions.md` (từ `service.md`), `seeds.md` (từ `database.md`). Bảng đầy đủ ở `CLAUDE.md` mục Rules.
- **Skill** (`.claude/skills/<name>/SKILL.md`, load khi liên quan): **quy trình** cho một loại task lặp lại — "gặp task này thì làm theo thứ tự này". Tự chọn lúc dùng, không phải thứ mọi task đều cần.

Ranh giới bốn nơi, không được lẫn:

| Nơi | Chứa | Ví dụ |
| --- | --- | --- |
| `CLAUDE.md` | **bản đồ** | có những module nào, doc nằm ở đâu |
| `.claude/rules/` | **ràng buộc** | MUST/MUST NOT, vi phạm là bug |
| `docs/` | **kiến thức** | vì sao hệ thống hoạt động như vậy |
| `.claude/skills/` | **quy trình** | làm theo thứ tự nào, validate bằng gì |

Skill **không** được chứa business knowledge, kiến trúc, mô tả DB hay coding rule — chỉ **trỏ** sang `docs/` và `.claude/rules/`. Một skill dài quá ~120 dòng gần như chắc chắn đang chép kiến thức vào nhầm chỗ.

## Chuẩn `SKILL.md` cho dự án

Rút gọn từ chuẩn Agent Skills (tham khảo [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto), MIT License):

- Vị trí: `.claude/skills/<kebab-case-name>/SKILL.md`. `name` trong frontmatter phải khớp tên thư mục.
- Frontmatter bắt buộc: `name` (kebab-case, không chứa "claude"/"anthropic") + `description` (nêu rõ skill làm gì **và** dùng khi nào — quyết định việc Claude có tự invoke đúng lúc hay không).
- Frontmatter tuỳ chọn: `argument-hint` khi skill nhận input dạng `$ARGUMENTS` (vd `"[feature]"`).
- Không dùng field `tags` — không thuộc chuẩn.
- Resource phụ (checklist dài, bảng tham chiếu, template) đặt ở `references/`, `templates/` cạnh `SKILL.md` — chỉ đọc khi skill thực sự cần, không nhồi vào thân `SKILL.md`.
- Thân bài theo đúng 5 mục, thứ tự này: `## When to use` · `## Required context` · `## Workflow` · `## Validation` · `## Related docs`. Thêm `## Ràng buộc` khi có giới hạn riêng.
- `Required context` chỉ **liệt kê đường dẫn cần đọc**, không tóm tắt nội dung của chúng.
- `Validation` ghi lệnh chạy thật. **Không** liệt kê `pnpm test*` (`docs/decisions/testing-paused.md`).
- Ngôn ngữ: viết **tiếng Việt** (skill là quy trình riêng của dự án); tên file/symbol trong backtick giữ tiếng Anh.

## Skill hiện có

| Skill | Vai trò |
| ----- | ------- |
| `domain-doc` | Viết mới hoặc audit `docs/domains/*.md` / `docs/workflows/*.md` so với source thật — business rule, bất biến, trình tự, `ErrorCode` có còn khớp code không, nội dung nằm đúng tầng chưa. |
| `new-api-module` | Trình tự thêm module API mới: doc → schema → migration → module → `app.module.ts` → `ErrorCode` → `PERMISSION_CODES` + seed quyền. Tồn tại vì **thứ tự**, không phải vì convention. |

`.claude/commands/` không còn tồn tại — toàn bộ đã chuyển sang `.claude/skills/`. Nếu cần một quy trình riêng của dự án chưa có skill tương ứng, viết mới theo đúng chuẩn ở trên thay vì làm tay lặp lại.

> Áp dụng ý tưởng từ [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto) (MIT License).
