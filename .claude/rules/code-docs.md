# Code Documentation Rules

Reference implementation: `ProductionOrdersService` class-level doc, `ProductionOrdersService.seedLines`/`issueProductionOrders` (`src/api/production-orders/production-orders.service.ts`).

## When to write a `/** */` doc comment

Only when the contract isn't already obvious from the name + signature: a constraint the caller must uphold, a non-obvious tradeoff, a reason for doing something in SQL instead of JS, a decision that reverses an earlier decision. Skip it when the name already says enough (`getOrders`, `deleteStockReceipt`) — a comment that restates the signature is noise, not documentation.

- **Controllers don't get doc comments** — `@ApiAuth({ summary })` already carries the description.
- **DTO fields don't get doc comments** — describe them via the field decorator's `description` option (`.claude/rules/dto.md`), not a `/** */` above the property.

## Shape

Two forms, chosen by *content*, not by length:

1. **One line** — exactly one constraint/note, on a single physical line:

   ```ts
   /** Replace-all. Bắt buộc truyền `tx` để tránh gọi nhầm, ghi ra ngoài transaction. */
   ```

2. **Summary + `Rules:`** — once a symbol carries two or more independent constraints: one summary sentence, a blank `*` line, a `Rules:` line, then one bullet per constraint, optionally closed by a `See X ...` line:

   ```ts
   /**
    * Đơn hàng bắt đầu ở `DRAFT`, cần Giám đốc duyệt trước khi đưa vào sản xuất.
    *
    * Rules:
    * - `approveOrder` là con đường duy nhất để đạt `AWAITING_PRODUCTION`.
    * - Request tạo/sửa không được set thẳng trạng thái đó (`E075`).
    * - Các chuyển trạng thái khác vẫn tự do.
    *
    * See `ensureOrderEditable` để biết giới hạn khi sửa.
    */
   ```

No multi-paragraph prose. If a comment would need more than ~10 lines to say what it means, the content belongs in `docs/features/<feature>.md` instead — leave a one-line pointer to it rather than inlining the whole explanation.

## Content

- **Viết bằng tiếng Việt** (đổi từ tiếng Anh ngày 2026-07-29, xem `.claude/rules/workflow.md`) — tên symbol/identifier trong dấu backtick vẫn giữ nguyên tiếng Anh (khớp code thật), chỉ phần diễn giải là tiếng Việt.
- One idea per bullet — don't chain three ideas together with em dashes inside a single bullet.
- Cross-reference with backticks: `` `OrdersService.recalculateTotals` ``, `` `E075` ``, `` `chk_stock_receipts_reason_type` ``.
- Prefer a `See X` line over re-explaining what `X` already does.
- Say **why**, not **what** — the code already says what; a comment repeating it is dead weight the next edit will forget to update.
- **A decision that carries a date** (a reversal, a deliberate removal) must keep the date and the reason when written or trimmed — that's the most valuable part of the comment, never cut it to fit the bullet shape.

## No JSDoc tags

Don't use `@param`/`@returns`/`@throws`/`@see` — the signature already carries the types, and a `See X` line covers what `@see` would. (The one existing exception, `@example` on `src/decorators/public.decorator.ts`, predates this rule and stays as-is.)

## Inline `//` comments

Keep doing what the repo already does: explain one specific line or branch inside a function body — why this order, why not the obvious approach. Still prose, not the `Rules:` shape (that shape is for symbol-level `/** */` only). Keep them to ~4 lines; longer than that means the explanation belongs on the symbol instead.

## Line width

Wrap around ~100 characters. Prettier (`printWidth: 80`) does not reflow comments, so this is a hand-kept convention, not something the formatter enforces.
