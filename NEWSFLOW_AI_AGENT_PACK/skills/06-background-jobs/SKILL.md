# Skill: Background Jobs, Scheduling and Idempotency

## Use when

- Polling feeds
- Extracting pages
- Running AI
- Publishing Facebook posts
- Sending notifications
- Scheduling posts

## Mandatory rules

- BullMQ/Redis.
- Separate queues by workload.
- Every job contains workspace ID, correlation ID, dedup key, and safe payload.
- Revalidate workspace/resource state inside worker.
- Idempotent processors.
- Explicit retryable vs unrecoverable errors.
- Exponential backoff with jitter.
- Timeouts.
- Dead-letter visibility.
- Per-tenant/provider/domain concurrency.
- Graceful shutdown.
- Singleton/locked scheduler.
- Scheduled times stored UTC.

## Required tests

- Job may run twice without duplicate durable effect.
- Permanent error stops retries.
- Transient error retries.
- Cancelled schedule does not publish.
- Ho Chi Minh local schedule maps to correct UTC instant.
