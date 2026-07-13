# Skill: Product Architecture and Phase Control

## Use when

- Starting a new phase
- Changing monorepo structure
- Defining module boundaries
- Introducing a new integration
- Making a cross-cutting architectural decision

## Responsibilities

- Translate product requirements into bounded modules.
- Keep web, API, worker, database, and shared contracts separated.
- Prefer a modular monolith plus dedicated workers for v1.
- Prevent premature microservice fragmentation.
- Define interfaces at external boundaries.
- Create ADRs for material decisions.
- Maintain phase scope.

## Mandatory checks

- Does this change introduce tenant-owned state?
- Does it require an audit event?
- Does it need asynchronous execution?
- Does it create retry/idempotency concerns?
- Does it expose secrets?
- Does it affect data retention?
- Can it be deployed and rolled back safely?
- Is a migration required?

## Deliverables

- Updated architecture/ADR
- Module boundaries
- Dependency direction
- Implementation order
- Test strategy
- Operational impact

## Done criteria

Architecture does not depend on hidden global state, UI-only authorization, or direct calls from controllers/components to external providers.
