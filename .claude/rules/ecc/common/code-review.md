# Code Review Standards

## When to review

- After writing or modifying code, before any commit.
- When auth, permission or user-data code changes.
- When module boundaries or a table change.

The exact agents and their order are in `../../project-overrides.md` ("After implementing code").

## Review checklist

- [ ] Code is readable and well-named (`naming.md`)
- [ ] Functions are focused (<50 lines)
- [ ] Source files are cohesive (under the 800-line soft ceiling, or with a reason for the exception)
- [ ] No deep nesting (>4 levels); prefer early returns
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No `console.log` or debug statements
- [ ] Comments follow `comments.md`

## Security review triggers

Use `security-reviewer` when the change:

- adds a route or edits `@Permissions` / `@Public`, or touches auth, JWT or credentials;
- handles file upload or any filesystem path;
- builds raw `sql` or a query from dynamic filter or sort input;
- is reachable from outside a controller (a job, an AI tool, another module), because services do not check permissions;
- calls an external API or uses cryptography.

An ordinary Drizzle read or write inside an existing, already-guarded route is not a trigger on its own.

## Severity levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK**: fix before merge |
| HIGH | Bug or significant quality issue | **WARN**: fix before merge |
| MEDIUM | Maintainability concern, including an unexplained file over 800 lines | **INFO**: list for the user |
| LOW | Style or minor suggestion | **NOTE**: optional |

Approve with no CRITICAL or HIGH; with only HIGH, merge with caution; with any CRITICAL, block.

## Common issues to catch

- Security: hardcoded credentials, SQL built by string concatenation, path traversal, authentication bypass.
- Quality: functions over 50 lines, files over 800 lines, deep nesting, swallowed errors, parameter mutation.
- Performance: N+1 queries (use joins or batching), list endpoints without a `limit` cap for non-HTTP callers, unbounded queries.
