# Security Guidelines

## Checks before a commit

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user input validated by a DTO
- [ ] Queries parameterized (Drizzle, or `sql` template with bound values)
- [ ] Authentication and authorization verified: controllers declare `@Permissions`, services do not check
- [ ] Error messages do not leak sensitive data

CSRF and rate limiting do not apply here: a stateless JWT API with no cookies, and rate limiting is a deployment decision.

## Secret management

- Never hardcode secrets; read them from environment variables through the config factories.
- A required secret that is missing must stop the app at boot (see `config.md`).
- Rotate any secret that may have been exposed.

## Security response protocol

If a security issue is found:

1. Stop.
2. Run the `security-reviewer` agent.
3. Fix CRITICAL issues before continuing.
4. Rotate any exposed secrets.
5. Look for the same pattern elsewhere in the codebase.
