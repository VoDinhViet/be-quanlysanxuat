# Agent Orchestration

ECC agents ship with the `ecc@ecc` plugin and are invoked through the Agent tool with a plugin-scoped
`subagent_type`, for example `Agent(subagent_type: "ecc:planner", prompt: "...")`. Pass `model` per
`../../model-routing.md`.

| Agent | Purpose | When to use |
|-------|---------|-------------|
| ecc:planner | Implementation planning | Multi-module features, large refactors |
| ecc:architect | System design | Architectural decisions |
| ecc:typescript-reviewer | TypeScript review | After writing backend code |
| ecc:code-simplifier | Simplify changed code | After writing code |
| ecc:security-reviewer | Security analysis | Triggers in `code-review.md` |
| ecc:database-reviewer | Migration and schema review | A migration or schema change |
| ecc:build-error-resolver | Fix build errors | When `tsc` or build fails |
| ecc:refactor-cleaner | Dead code cleanup | Code maintenance |
| ecc:doc-updater | Codemaps and docs | After a route, table or flow changes |

`ecc:tdd-guide` is never used here; see `../../project-overrides.md`. The full roster is in `/ecc:ecc-guide`.

## Parallel execution

Run independent agents in one message (for example simplifier and reviewer together), not one after another.

## Delegation completion contract

Applies to every agent at every depth (parent, child, grandchild):

1. **Your final message IS the deliverable.** Never end your turn with "waiting for background agents": a spawned task is not a completed task, and ending the turn orphans the children's results.
2. **If you delegate, you own collection.** Wait for results, integrate them, then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent.
