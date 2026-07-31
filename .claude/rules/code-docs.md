# Code Documentation Rules

Reference: `ProductionOrderStatus`/`ProductionJobStatus` docs (`src/database/schemas/production.ts`).

- MUST write a `/** */` doc comment only when the contract isn't obvious from the name + signature: a constraint the caller must uphold, a non-obvious tradeoff, a reason for doing something in SQL instead of JS, a decision that reverses an earlier one.
- MUST NOT write a comment that restates the signature (`getOrders`, `deleteStockReceipt` need none).
- MUST NOT put doc comments on controllers (`@ApiAuth({ summary })` carries the description) or on DTO fields (use the decorator's `description`).
- MUST write comments in **Vietnamese**; symbol/identifier names inside backticks stay English.
- MUST say **why**, not **what**.
- MUST keep a date + reason when writing or trimming a comment about a reversal or deliberate removal.
- MUST use one of exactly two shapes, chosen by content:
  1. **One line** — exactly one constraint: `/** Replace-all. Bắt buộc truyền `tx` để tránh ghi ra ngoài transaction. */`
  2. **Summary + `Rules:`** — two or more independent constraints: one summary sentence, blank `*` line, `Rules:` line, one bullet per constraint.
- MUST keep one idea per bullet. MUST NOT chain several ideas with em dashes inside one bullet.
- MUST NOT write multi-paragraph prose. If it needs more than ~10 lines, move it to `docs/features/<feature>.md` and leave a one-line pointer.
- MUST NOT use JSDoc tags (`@param`/`@returns`/`@throws`/`@see`) — use a `See X` line instead.
- MUST cross-reference with backticks: `` `OrdersService.recalculateTotals` ``, `` `E075` ``, `` `chk_stock_receipts_reason_type` ``.
- Inline `//` comments MUST explain one specific line or branch (why this order, why not the obvious approach) and stay under ~4 lines.
- MUST wrap comments around ~100 characters (Prettier does not reflow them).
