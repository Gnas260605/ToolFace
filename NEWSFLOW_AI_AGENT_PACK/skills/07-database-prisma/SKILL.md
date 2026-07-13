# Skill: PostgreSQL and Prisma Data Design

## Use when

- Creating schema
- Adding migrations
- Optimizing query patterns
- Implementing repositories/transactions

## Mandatory rules

- PostgreSQL as source of truth.
- Prisma schema and reviewed migrations.
- UUID/UUIDv7 identifiers.
- UTC timestamps.
- `workspace_id` indexes.
- Composite uniqueness for tenant resources.
- Publish idempotency uniqueness.
- Short transactions.
- Append-only audit behavior from app code.
- Cursor pagination.
- Soft deletion where retention is required.
- Avoid N+1 queries.
- Migration rollback/forward-fix plan.

## Required tests

- Unique constraints enforce duplicate prevention.
- Transaction rollback leaves no partial state.
- Workspace-scoped repository never returns foreign rows.
- Migration runs on clean database.
- Migration runs on representative previous schema.
