# Skill: Facebook Pages API Integration

## Use when

- Implementing Meta OAuth
- Listing/selecting Pages
- Storing Page tokens
- Publishing/scheduling/retrying posts
- Preparing App Review

## Mandatory rules

- Official Meta API only.
- Minimum permissions.
- Configurable Graph API version.
- Server-side OAuth callback.
- Strong one-time OAuth state tied to user/workspace and expiry.
- Never collect Facebook password.
- Encrypt Page token with authenticated encryption.
- Token never returned to browser after storage.
- Validate Page identity, tasks, scopes, and publishing ability.
- Publish only approved immutable draft version.
- Idempotency key plus database uniqueness.
- Distributed job lock.
- Retry transient errors only.
- Reauthorization and permission errors are surfaced clearly.
- Token and Authorization header never logged.
- Mock Meta server in automated tests.
- Re-check official docs before release.

## Required tests

- OAuth state replay rejected.
- Workspace cannot connect another workspace’s pending state.
- Token ciphertext differs from plaintext.
- Duplicate publish request creates one job.
- Worker retry does not create duplicate post in tested reconciliation path.
- Unapproved draft is rejected.
