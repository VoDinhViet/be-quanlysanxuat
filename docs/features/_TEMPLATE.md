# Feature: <name>

> Copy this file to `docs/features/<feature>.md` before implementing a new feature or a non-trivial change to an existing one. Scope: business rules and API contract only — how to implement it (controller/service/DTO shape, error handling) is already covered by `.claude/rules/`, don't repeat it here.

## Goal

What problem this solves and for whom, in 1-3 sentences.

## Business rules

- Required fields, constraints, defaults.
- Validation rules beyond basic types (uniqueness, format, cross-field).
- State/status transitions, if any.
- Anything computed or derived (auto-generated codes, defaults based on other fields).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | /x | jwt/public | Query params | 200 + body |

For each endpoint, list only what's not obvious from the DTO itself: which fields are optional on create vs update, which filters a list endpoint supports, what a 404/409/etc. case means in business terms.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| ... | `ErrorCode.Exxx` | 409 |

## Out of scope

What this feature explicitly does NOT do (so nobody accidentally expands scope later).

## Frontend integration notes

What a frontend consuming this API needs to know after this change: renamed/removed fields, new required fields, changed response shapes, new error codes to handle. Date-stamp breaking changes (e.g. `**Breaking change (YYYY-MM-DD)**: ...`). If nothing changed for consumers, write "No breaking changes as of YYYY-MM-DD."
