---
name: write-domain-doc
description: Write or update one part of the project docs (docs/domains/<area>.md or docs/architecture.md) from the current source code. Use when asked to write, continue or refresh a docs part.
disable-model-invocation: true
---

# Write a docs part

`docs/README.md` lists every part, its source folders and whether it is done. Take the part named in the request, or the first one marked "Chưa viết".

## Steps

1. **Read the code, not the old docs.** The docs deleted in commit `9d1f7ca` are stale (WIP removed, enums renamed). Read, for each module in the part: the schema in `src/database/schemas/`, `*.controller.ts` (route, `@Permissions`, status code), `*.service.ts` (business rules, `AppException` sites), and the DTOs when a field matters. Use `codegraph_explore` first if the repo has a `.codegraph/` directory.
2. **Verify before writing.** Every route, permission code, status, error code and number must come from the source you read. Look up each `E###` in `src/constants/error-code.constant.ts`. If you cannot confirm something, leave it out or say it is unverified.
3. **Write `docs/domains/<area>.md`** in Vietnamese; keep identifiers, enum values, route paths and error codes as in code. Cover per module: data model (tables, key columns, constraints), routes with their permission, business rules and state transitions, side effects on other modules, error codes. Use tables for routes and error codes; keep prose short.
4. **Record contradictions as notes.** When the code disagrees with itself (a check that misses a table, a route with no permission, a stale comment) write it down as a "Lưu ý" in the doc. Do not change source code in the same change.
5. **Keep names the code already points at.** `grep -rhoE "docs/(domains|workflows)/[a-z0-9_-]+\.md" src` shows which doc names comments expect (for example `inventory.md`, `production.md`, `purchasing.md`).
6. **Update `docs/README.md`:** flip the part's status to "Xong" and link the file.
7. **Commit the part on its own** (English message, `docs: ...`), only when the user asks for a commit.

## Checks before finishing

- No claim you did not read in code. No guessed behaviour, no copied text from the old docs.
- Tables render (header separator row present). `MD060` warnings from the editor are cosmetic.
