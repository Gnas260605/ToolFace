# Skill: Billing, Plans and Commercialization

## Use when

- Implementing subscriptions
- Usage quotas
- Trials
- Feature gates
- Agency/white-label foundation

## Mandatory rules

- Billing provider adapter.
- Mock provider for development.
- Prices configuration-driven.
- Backend feature enforcement.
- Signed, idempotent webhooks.
- Usage ledger/events.
- Grace behavior for billing outages.
- Clear trial expiration.
- Owner-only billing management.
- Audit subscription changes.
- Do not mix payment status directly into unrelated domain code.

## Required tests

- Duplicate webhook has one effect.
- Downgrade enforces limits safely.
- Existing content is not silently deleted on downgrade.
- Quota race condition is prevented.
- Suspended subscription behavior is explicit.
