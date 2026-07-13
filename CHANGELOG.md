# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-07-12

### Added

- Monorepo structure setup using Turborepo and pnpm workspaces.
- TypeScript strict configurations and shared ESLint rules.
- Environment variables validation at startup using Zod schema.
- NestJS API backend containing `/health/live`, `/health/ready`, and `/api/v1/system/info` endpoints.
- NestJS Worker setup verifying Redis connectivity and health monitoring.
- Next.js Web frontend in Vietnamese checking dynamic backend API status.
- Docker Compose configuration for local development services: PostgreSQL, Redis, MinIO, and Mailpit.
- Production-ready Dockerfiles for api, web, and worker.
- CI pipeline workflow config for GitHub Actions.
- Local development operations documentation and health check procedures.
