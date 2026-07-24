# `.claude/` — quy ước rule & skill của dự án

Tài liệu này giải thích cách dự án tổ chức cấu hình dành cho Claude Code. Không `@import` vào `CLAUDE.md` — chỉ đọc khi cần thêm/sửa một rule hoặc skill, không load ở mỗi phiên làm việc.

## Rule vs Skill — khi nào dùng cái nào

- **Rule** (`.claude/rules/*.md`, luôn load qua `@import` trong `CLAUDE.md`): convention áp dụng cho **gần như mọi task code** trong repo — vi phạm là bug, không phải "quên dùng công cụ". Ví dụ: `api-module.md`, `dto.md` (đụng tới ở hầu hết mọi module), `errors-pagination.md`, `workflow.md`.
- **Skill** (`.claude/skills/<name>/SKILL.md`, load khi liên quan): quy trình/năng lực rời rạc, tự chọn lúc dùng, không phải thứ mọi task đều cần — refactor tài liệu, audit `CLAUDE.md`, refactor code theo Fowler...

**Đã audit lại cả 6 rule hiện có (2026-07-24) và quyết định giữ nguyên cả 6 làm rule luôn-load, không chuyển cái nào sang skill:**

- `workflow.md`, `api-module.md`, `dto.md`, `errors-pagination.md` — áp dụng cho gần như mọi task code trong repo backend này, không phải "task cụ thể" theo nghĩa cần skill riêng.
- `database.md`, `testing.md` — phạm vi hẹp hơn (chỉ khi đụng schema/test), nhưng: (a) kích thước nhỏ (22 + 105 dòng), chi phí luôn-load không đáng kể; (b) thực tế gần như mọi task code trong repo này đều kết thúc bằng cập nhật test (xem memory "Run typecheck after coding") — nếu chuyển `testing.md` thành skill on-demand, rủi ro nó không tự trigger đúng lúc (sửa service xong quên viết/sửa spec) lớn hơn lợi ích tiết kiệm context.

Quyết định này có thể đảo ngược khi dự án lớn hơn/rule phình to hơn — nếu cân nhắc lại, sửa ngay mục này thay vì âm thầm bỏ qua.

## Chuẩn `SKILL.md` cho dự án

Rút gọn từ chuẩn Agent Skills (tham khảo [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto), MIT License):

- Vị trí: `.claude/skills/<kebab-case-name>/SKILL.md`. `name` trong frontmatter phải khớp tên thư mục.
- Frontmatter bắt buộc: `name` (kebab-case, không chứa "claude"/"anthropic") + `description` (nêu rõ skill làm gì **và** dùng khi nào — quyết định việc Claude có tự invoke đúng lúc hay không).
- Frontmatter tuỳ chọn: `argument-hint` khi skill nhận input dạng `$ARGUMENTS` (vd `"[feature]"`, `"[feature|commit-range]"`).
- Không dùng field `tags` — không thuộc chuẩn (tồn tại thừa ở bản `doc-refactor.md` cũ dạng command, đã bỏ khi migrate sang skill).
- Resource phụ (checklist dài, bảng tham chiếu, template) đặt ở `references/`, `templates/` cạnh `SKILL.md` — chỉ đọc khi skill thực sự cần, không nhồi vào thân `SKILL.md`.
- Ngôn ngữ: skill mang tính quy trình riêng của dự án (đụng tới `docs/features/*.md`, convention nội bộ) viết **tiếng Việt**, theo style Bối cảnh / Input / Việc cần làm (xem `doc-refactor/SKILL.md`). Skill mang tính tham khảo tổng quát, ngôn ngữ-agnostic (vd catalog code smell của Fowler) giữ **tiếng Anh** nguyên bản.

## Skill hiện có

| Skill | Vai trò |
| ----- | ------- |
| `doc-refactor` | Viết mới/tái cấu trúc macro-level 1 file `docs/features/<feature>.md` — không theo khung cố định, tự điều chỉnh mục theo nhu cầu thực tế của feature, phát hiện tên gọi cũ còn sót. |
| `doc-generator` | Audit micro-level: đối chiếu bảng "API contract" trong `docs/features/<feature>.md` với controller/DTO/`ErrorCode` thật trong `src/api/<feature>/`. |
| `code-refactor` | Refactor code theo phương pháp Fowler (không phải tài liệu) — 6 phase, có test làm lưới an toàn. |
| `claude-md` | Tạo/audit `CLAUDE.md` theo Golden Rules (Less is More, Universal Applicability...). |

`.claude/commands/` không còn tồn tại — toàn bộ đã chuyển sang `.claude/skills/` (kể cả `frontend-notes` cũ, đã xoá; nếu cần lại quy trình đó, viết một skill mới theo đúng chuẩn ở trên).

> Áp dụng ý tưởng từ [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto) (MIT License).
