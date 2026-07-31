# `.claude/` — quy ước rule & skill của dự án

Tài liệu này giải thích cách dự án tổ chức cấu hình dành cho Claude Code. Không `@import` vào `CLAUDE.md` — chỉ đọc khi cần thêm/sửa một rule hoặc skill, không load ở mỗi phiên làm việc.

## Rule vs Skill — khi nào dùng cái nào

- **Rule** (`.claude/rules/*.md`): convention áp dụng cho **gần như mọi task code** trong repo — vi phạm là bug, không phải "quên dùng công cụ". 5/8 file luôn `@import` vào `CLAUDE.md`: `workflow.md`, `api-module.md`, `dto.md`, `code-docs.md`, `database.md`. 3 file còn lại **không** import, chỉ đọc đúng lúc rơi vào tình huống đó — mỗi file có một dòng trỏ tới nó nằm trong rule đã import quản lý khoảnh khắc đó: `transactions.md` (từ `api-module.md`), `seeds.md` (từ `database.md`), `testing.md` (testing đang tạm dừng, xem `CLAUDE.md` Standing decisions).
- **Skill** (`.claude/skills/<name>/SKILL.md`, load khi liên quan): quy trình/năng lực rời rạc, tự chọn lúc dùng, không phải thứ mọi task đều cần.

## Chuẩn `SKILL.md` cho dự án

Rút gọn từ chuẩn Agent Skills (tham khảo [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto), MIT License):

- Vị trí: `.claude/skills/<kebab-case-name>/SKILL.md`. `name` trong frontmatter phải khớp tên thư mục.
- Frontmatter bắt buộc: `name` (kebab-case, không chứa "claude"/"anthropic") + `description` (nêu rõ skill làm gì **và** dùng khi nào — quyết định việc Claude có tự invoke đúng lúc hay không).
- Frontmatter tuỳ chọn: `argument-hint` khi skill nhận input dạng `$ARGUMENTS` (vd `"[feature]"`).
- Không dùng field `tags` — không thuộc chuẩn.
- Resource phụ (checklist dài, bảng tham chiếu, template) đặt ở `references/`, `templates/` cạnh `SKILL.md` — chỉ đọc khi skill thực sự cần, không nhồi vào thân `SKILL.md`.
- Ngôn ngữ: skill mang tính quy trình riêng của dự án (đụng tới `docs/features/*.md`, convention nội bộ) viết **tiếng Việt**, theo style Bối cảnh / Input / Việc cần làm.

## Skill hiện có

| Skill | Vai trò |
| ----- | ------- |
| `feature-doc` | Viết mới, tái cấu trúc, hoặc audit độ chính xác 1 file `docs/features/<feature>.md` so với source thật trong `src/api/<feature>/` — gộp cả macro (cấu trúc/mục/tên gọi) lẫn micro (route/permission/DTO field/`ErrorCode` có khớp code không) trong một quy trình. |

`.claude/commands/` không còn tồn tại — toàn bộ đã chuyển sang `.claude/skills/`. Nếu cần một quy trình riêng của dự án chưa có skill tương ứng, viết mới theo đúng chuẩn ở trên thay vì làm tay lặp lại.

> Áp dụng ý tưởng từ [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto) (MIT License).
