# Không viết test ở giai đoạn này

**Trạng thái:** còn hiệu lực (siết thêm: xoá luôn rule khỏi `.claude/rules/`)

## Bối cảnh

Repo có 21 file `*.spec.ts` (còn lại sau khi rút gọn về base template) viết ở giai đoạn đầu. Schema,
enum trạng thái và business rule còn đổi liên tục — spec hỏng nhanh hơn tốc độ sửa, và mỗi lần đổi
enum lại kéo theo một đợt sửa mock không mang lại tín hiệu nào.

## Quyết định

Dự án **chưa cần test**. Cụ thể:

- Không tạo/sửa `*.spec.ts`. Không chạy `pnpm test*`. Ngoại lệ duy nhất: người dùng yêu cầu rõ.
- **`.claude/rules/testing.md` đã bị xoá** — trước đó nó chỉ tồn tại dưới dạng file
  đóng băng không được `@import`, tức là chi phí duy trì mà không có tác dụng.
- Spec đang có **giữ nguyên tại chỗ**, không xoá — nhưng xem cảnh báo dưới.
- `package.json` giữ nguyên script `test`/`test:e2e`/`test:cov` và cấu hình Jest.

## Hệ quả

- Validation sau khi code là `pnpm lint` + `npx tsc --noEmit` + `pnpm build`.
- **File spec trong `src/` đã lệch code và không ai chạy chúng.** Đừng đọc chúng như tài liệu về
  hành vi hiện tại, và đừng sửa chúng khi đổi service — chúng không phải nguồn sự thật.
- `src/test-utils/` (`chainable-mock.util.ts`, `jest-setup.ts`) chỉ còn phục vụ đám spec đó.

## Khi nào bật lại

Quy ước viết test cũ còn nguyên trong git — khôi phục bằng
`git show fb37682:.claude/rules/testing.md`. Bật lại thì đưa file đó về `.claude/rules/`, thêm dòng
`@import` tương ứng vào mục `## Rules` của `CLAUDE.md`, bỏ MUST NOT trong `.claude/rules/general.md`,
rồi xoá file này.

Trước khi bật lại nên quyết định luôn: **xoá spec cũ rồi viết lại**, hay sửa dần. Sửa dần gần như
chắc chắn tốn hơn viết mới.
