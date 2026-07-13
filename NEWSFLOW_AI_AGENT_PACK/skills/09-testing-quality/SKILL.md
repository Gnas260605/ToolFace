# Skill: Testing and Quality Gates

## Use when

- Implementing every feature
- Creating CI
- Fixing regressions
- Preparing release

## Required layers

- Unit tests for domain logic.
- Integration tests for database, Redis, provider adapters.
- E2E tests for critical customer flows.
- Security tests for SSRF, XSS, CSRF, IDOR, OAuth replay.
- Contract tests for AI structured output and Meta error mapping.

## Mandatory rules

- No real Meta or AI API calls in CI.
- Use deterministic fixtures.
- Do not delete a failing test merely to pass CI.
- Test tenant isolation explicitly.
- Test job retries and idempotency.
- Test migrations.
- Test timezones.
- Report observed command output truthfully.

## Quality gate

- Format
- Lint
- Typecheck
- Unit/integration tests
- Critical E2E
- Production build
- Secret scan
- Dependency scan
