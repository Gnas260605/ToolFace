# ADR 0006: SaaS Commercialization and Settings

## Status

Accepted

## Context

Phase 6 needs commercial controls, usage gating, an admin surface, and a configuration system without weakening tenant isolation or exposing secrets.

## Decisions

- Billing uses a provider abstraction so local development and CI can run entirely on a mock provider while preserving a production adapter seam.
- Plans are database-driven so pricing, visibility, feature flags, and limits can evolve without redeploying business logic.
- Plan versions preserve historical commercial terms and make upgrades or downgrades auditable.
- Trials are created lazily for workspaces with no subscription in the current repository because the existing workspace-creation flow is not yet implemented here.
- Usage reservations are stored separately from counters so quota checks can remain atomic under concurrent requests.
- Downgrades never delete customer content; they only restrict future creation or action paths.
- Settings use a typed registry as the only allowlist for valid keys, scope, defaults, and validation.
- Secrets remain outside normal settings tables; settings only expose safe state such as configured or masked values.
- System settings and workspace settings are separated to preserve global security baselines and plan enforcement.
- Settings changes are append-only in history and rollback creates a fresh history entry.
- Feature flags cannot override authorization or disable mandatory security controls.
- System-admin authority is separated from workspace roles through explicit system-role checks.
- Full reseller hierarchy remains deferred because Phase 6 only needs white-label foundations and commercial boundaries.

## Consequences

- Phase 6 can be tested with deterministic mock billing webhooks.
- Existing domain actions can opt into feature gates incrementally.
- The configuration model is safer than arbitrary key-value settings, but requires registry maintenance for every new setting.
- This repo still needs real Phase 1 identity and workspace models before all Phase 6 acceptance criteria can be fully verified.
