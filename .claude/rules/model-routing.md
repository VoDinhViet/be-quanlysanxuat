# Model routing

Start with the cheapest model that can do the job. Move up a tier only when the lower tier fails for a clear reasoning reason.

The project model is `opusplan` (`.claude/settings.local.json`): Opus while in plan mode, Sonnet while executing.

## Plan mode

- Use plan mode for multi-module features, schema or module-boundary design, and ambiguous requirements.
- Do small, well-scoped, single-file changes directly. Do not plan them.
- Read `docs/CODEMAPS/INDEX.md` and the domain's codemap first. Launch an `Explore` agent (`haiku`) only when the codemap does not answer the question, and use one agent for a single-domain task.

## Subagents

`Explore` and `Plan` inherit the main model, so pass `model` on every Agent call instead of relying on defaults.

| Tier | Use for |
|---|---|
| `haiku` | `Explore`, finding or reading code, `ecc:docs-lookup`, `ecc:doc-updater`, running commands and summarizing output, mechanical edits |
| `sonnet` | Implementation, bug fixes, refactors, routine review (`ecc:typescript-reviewer`, `ecc:build-error-resolver`, `ecc:code-simplifier`) |
| `opus` | `ecc:planner` and `ecc:architect` for multi-module work, root-cause debugging across files, and `ecc:security-reviewer` or `ecc:database-reviewer` when auth, permissions or a risky migration is involved |

## Keeping tokens down

- Run independent subagents in parallel, each with a brief that already holds the paths and context it needs.
- Do not set `CLAUDE_CODE_SUBAGENT_MODEL` or `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`: they would downgrade or override the agents above.
- Unverified: which model a subagent inherits when the main model is `opusplan`. Pass `model` explicitly.
