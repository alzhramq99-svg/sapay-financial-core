# Contributing to SApay

This file is the working form of the team charter. The repository on GitHub is
the single source of truth for code, tasks and technical discussion.

## Roles

- **Owner / product** — final approver of every merge. No pull request merges
  without the owner's approval, whoever wrote or reviewed it.
- **Engineers (human or AI)** — implement, review each other's pull requests,
  and record decisions in PR and issue comments.

Peer review between engineers is an extra layer, not a replacement for the
owner's approval. This matters most for anything touching money movement,
authentication or migrations.

## Workflow

1. **Issue first.** Every change starts from an issue that states the problem,
   the acceptance criteria and what is out of scope.
2. **One branch per issue**, created from the branch the work will merge into:
   - `feature/<short-name>` for new behaviour
   - `fix/<short-name>` for bug fixes
   - `chore/<short-name>` for tooling, CI and docs
3. **Pull request** using the template. Explain the decisions and trade-offs,
   not only the diff.
4. **CI must be green.** CI runs on every pull request, whatever its base
   branch.
5. **Review, then the owner's approval, then merge.** Authors never merge their
   own pull requests.

`main` is protected. Never push to it directly.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) and reference
the issue:

```
fix(ledger): reject transfers to the source wallet (#42)

Explain why the change is needed when it is not obvious from the subject.
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`,
`perf`. Common scopes: `ledger`, `auth`, `db`, `web`, `ios`, `ci`.

## Quality bar

- **Tests with every change.** Unit tests for logic; integration tests against
  PostgreSQL for anything touching the database or the ledger. Cover failure
  paths, not only the happy path.
- **Documentation explains why.** Comment the reasoning behind non-obvious
  code; do not restate what the code does.
- **Security is part of the change.** No secrets in code or commits, no real
  personal or banking data, and validate every input at the API boundary.

## Releases

Milestones group the issues for a release. Releases are tagged
`vMAJOR.MINOR.PATCH` (pre-releases: `v0.1.0-beta.N`).

## Running the app

See [`sapay-core 15/README.md`](sapay-core%2015/README.md).
