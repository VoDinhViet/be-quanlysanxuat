# Code comments

Restored from the pre-ECC `code-docs.md`, shortened. Applies to code you add or touch and to the comment cleanup.

- Write a comment only when name and signature do not carry the contract: a constraint the caller must uphold, a non-obvious tradeoff, why SQL instead of JS, a decision that reversed an earlier one. Say **why**, never **what**.
- Never restate the name or signature, never narrate the next line, never leave a changelog ("added for PH-xxx", "previously...") or a pointer to a deleted file.
- No doc comments on controllers (`@ApiAuth({ summary })` carries it) or on DTO fields (use the decorator's `description`).
- Language: Vietnamese; identifiers, tables, error codes and enum values stay in backticks and in English (`OrdersService.recalculateTotals`, `E075`).
- Shape: one line for one constraint. Two or more independent constraints: one summary sentence, a blank ` *` line, `Rules:`, one bullet per constraint, one idea per bullet.
- No `@param` / `@returns` / `@throws`. Cross-reference with a `See X` line.
- Inline `//` explains one specific line or branch (why this order, why not the obvious way) in at most 4 lines.
- A comment over about 10 lines is a design note: shorten it to the rule, and point at the matching `docs/CODEMAPS/*.md` file instead of pasting the flow.
- Wrap around 100 characters (Prettier does not reflow comments).
- A comment that contradicts the code is a bug: fix or delete it. Keep the date and reason for a deliberate removal or reversal.
- Cleanup never changes code, strings or identifiers, and keeps comments that explain a non-obvious business rule.
