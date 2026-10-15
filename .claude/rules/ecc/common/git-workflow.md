# Git Workflow

Never commit or push unless the user orders it in that request. Approval for one commit does not carry to the next.

## Commit message format

Conventional Commits with a scope, in English:

```
feat(scope): description (PH-xxx)

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci.

`includeCoAuthoredBy` is `false` in `~/.claude/settings.json`, so commits carry no `Co-Authored-By` trailer.

## Pull requests

1. Read the full commit history, not only the latest commit.
2. Use `git diff [base-branch]...HEAD` to see all changes.
3. Write a PR summary and a test plan.
4. Push with `-u` for a new branch.
