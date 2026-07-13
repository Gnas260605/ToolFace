# Skill: DevOps, Deployment and Observability

## Use when

- Creating Docker/Compose
- CI/CD
- Health checks
- Logs, metrics, alerts
- Backup/restore
- Production deployment

## Mandatory rules

- Separate web/API/worker deployable units.
- Immutable images.
- Non-root containers where practical.
- Multi-stage builds.
- Environment validation.
- Separate staging/production.
- Structured logs with correlation IDs.
- Redact tokens and headers.
- Liveness/readiness endpoints.
- Queue, source, AI, Meta, database metrics.
- Graceful shutdown.
- Daily backups initially.
- Documented restore and rollback.
- Controlled migration job.
- Resource limits.

## Required checks

- Clean local startup.
- Production image build.
- Health checks.
- Container shutdown does not lose active jobs unexpectedly.
- Restore test documented and executed before launch.
