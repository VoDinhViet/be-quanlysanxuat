# Documentation Rules

Mọi thứ viết ra mà không phải code: comment trong source, và bốn tầng doc trong `docs/`.

## Which layer holds what

- MUST write/update docs before implementing a new feature or changing business rules, in the right layer. Skip for pure bug fixes and behavior-preserving refactors.
  - `docs/architecture.md` — cross-module facts: how two modules' data connects, write order spanning modules.
  - `docs/domains/<domain>.md` — the **why**: concepts, lifecycle/state machine, business rules, invariants, cross-domain dependencies, common mistakes.
  - `docs/workflows/<flow>.md` — the **in what order**: trigger, actor, preconditions, steps, state changes, side effects, transaction boundary, failure cases. Only for flows spanning ≥ 2 writes or ≥ 2 modules.
  - `docs/decisions/<slug>.md` — a **reversal or scope boundary** no domain owns: what was replaced, why, and what not to undo.
- MUST NOT put business rules in `.claude/rules/*` or `CLAUDE.md` — they belong in `docs/domains/`.
- MUST NOT put knowledge (domain, architecture, DB, coding rules) in `.claude/skills/*` — a skill is a procedure that **references** docs.
- MUST NOT put a domain-specific rationale in `docs/decisions/` — that belongs in the domain doc.
- MUST NOT restate a business rule in a workflow doc — state the sequence, link the rule to `docs/domains/`.
- MUST NOT create a per-module doc layer — `docs/features/` was deleted (`docs/decisions/swagger-owns-api-reference.md`).
- MUST NOT hand-write a route/DTO table in any doc — Swagger (`/api-docs`, generated from `@ApiAuth`/`@ApiPublic`) owns that and never goes stale. Write only what a signature can't show: semantics, check ordering, implicit constraints, which routes are really public.

## Code comments

Default is **no comment**. A `/** */` earns its place only by passing at least one of the four
tests below; passing none means delete it.

Reference done right: `OrdersService.approveOrder`, `ProductionOrdersService.seedPlan`,
`BomsService.checkNoCycle`. Reference correct *because* they carry zero comment lines:
`ClientsService`, `UnitsService`, the `client-groups`/`departments`/`positions` services.

### The four tests — passing one is enough to write a comment

1. **Multiple write sites / multiple modules** — writes ≥ 2 tables, or pulls another module into the
   same transaction.
2. **Call-order constraint** — the caller must invoke something before/after this, or must pass `tx`.
3. **The name lies** — the function does more/less/other than its name suggests (`getStockLevels`
   must exclude the order under evaluation itself; `updateProductionOrder` is partial, not
   replace-all).
4. **Deliberate limitation** — a choice that looks like a bug but is a decision (deliberately no
   `WITH RECURSIVE`, in-memory tree walk instead).

### MUST NOT comment — closed list

- Controllers, DTOs (**both class and field**), `*.module.ts`, `index.ts`, seeds.
- Single-table CRUD: `getXs`/`getX`/`createX`/`updateX`/`deleteX`.
- Standard check helpers: `ensureXExists`, `validateXUniqueness`.
- Private select/mapper helpers.
- Anything that only restates the function name, the signature, or a rule already in `docs/`.

### Shape once a comment is justified

- MUST be ≤ **6 lines** including `/**` and `*/`. Needs more → move it to
  `docs/domains/<domain>.md`, leave a one-line pointer.
- MUST be written once at the site of authority; other files **point to it in one line**, never
  copy it.
- MUST NOT write a changelog in code (`removed on 2026-07-30`, `revived same day`) — history belongs
  to git and `docs/decisions/`. The one exception: a retired `ErrorCode` (see below).
- MUST NOT use a section-banner comment (`// Error`, `// 1. Supplier information`).
- A class-level comment is only for a service in a genuinely complex flow, ≤ 6 lines: what the
  module owns (one sentence) + a pointer to `docs/domains/` + `docs/workflows/`. No rules, no
  history.
- (unchanged) Vietnamese · why not what · cross-reference with backticks · no JSDoc tags · wrap
  ~100 chars · inline `//` ≤ 4 lines, explaining exactly one line/branch.

### `src/database/schemas/*.ts` specifically

- MUST only comment what the column/type genuinely can't say on its own: why `onDelete: restrict`
  instead of `cascade`, why nullable, that a value can go negative, what a CHECK does **not**
  guarantee.
- MUST NOT describe lifecycle/state machine/business rules here — that belongs in
  `docs/domains/`; leave exactly one line pointing there.

### `src/constants/error-code.constant.ts` specifically

- MUST comment a code **only when** its value string isn't self-explanatory, or it's easily
  confused with another code (`E011` vs `E043`, `E044` vs `E045`).
- MUST keep the comment on a **retired/reserved** code — the one place in the repo that prevents
  a number from being reused for something else.
- MUST NOT comment a code whose comment only translates its own value string.
