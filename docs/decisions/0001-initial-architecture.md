# ADR 0001: Initial System Architecture for NewsFlow AI

## Status

Accepted

## Context & Problem Statement

NewsFlow AI is designed as a multi-tenant SaaS application to ingest news from RSS/APIs, synthesize facts using AI, allow editors to review drafts, and publish directly to Facebook Pages.

The architecture needs to scale in terms of user traffic, job ingestion throughput, AI pipeline complexity, and development velocity, while keeping operational complexity low for the initial release (Version 1).

## Decisions

### 1. Monorepo Structure

We will organize the codebase as a monorepo using **`pnpm` workspaces** and **Turborepo**.

- **Why**: It allows sharing code (configuration, database schemas, interfaces, shared types) easily between applications (Web, API, Worker) without the overhead of publishing private npm packages. It keeps build and test tooling centralized.

### 2. Modular Monolith API with Standalone Workers

For Version 1, the backend API is structured as a single Modular Monolith (NestJS), with background workers running in a separate application context (Worker).

- **Why**: A modular monolith simplifies local development, testing, and deployment. Placing background execution (RSS ingestion, AI generations, publishing) in separate Worker processes ensures that resource-intensive jobs do not starve the HTTP API of resources.
- **Scalability**: By keeping modules strictly bounded and relying on queues for communication, we can easily split individual modules into standalone microservices if operational bottlenecks arise later.

### 3. PostgreSQL as the Primary Database

PostgreSQL is chosen as the single source of truth for durable data.

- **Why**: Highly mature, supports strict ACID properties (vital for subscription billing, organization permissions, and audit logs), and has native UUIDv7 support. It also handles JSON data types natively, allowing us to store structured payloads like extracted facts and brand profiles safely.

### 4. Redis and BullMQ for Background Jobs

Asynchronous queues will use Redis as the backend data store, managed by BullMQ.

- **Why**: BullMQ provides advanced features like parent-child job dependencies (e.g., fetching a feed, then triggering fact extraction for each article), rate limiting, exponential backoff retries, and job deduplication. Redis offers extremely low latency for queue operations.

### 5. External Providers behind Adapters

All external integrations (AI Providers, Meta Graph API, Billing Providers, S3 Storage, Mail Service) must reside behind strict TypeScript interface abstractions (ports) and concrete adapters.

- **Why**: Prevents vendor lock-in. Testing can be performed deterministically by swapping production adapters for mock adapters without modifying core business logic.

## Deployment Boundaries

- **Next.js Web**: Deployed to a CDN or node-based app engine, communicates only with the API.
- **NestJS API**: Deployed as a web service. Interacts with PostgreSQL, Redis, S3-compatible storage, and registers jobs.
- **NestJS Worker**: Deployed as background worker service(s). Processes ingestion, AI, and publishing queues.

## Trade-offs

- **Initial Scaffolding**: Setup of monorepos, TSConfigs, ESLint configurations, and Docker configurations takes more time upfront than single-repo setups.
- **Database Shared State**: All modules share the same PostgreSQL database cluster initially. While schemas are modular, a database failure impacts all modules.

## Scale Paths

1. **Queue Scaling**: Workers can be horizontally scaled independently of the API based on queue depths.
2. **Database Read Replicas**: Read-heavy queries (e.g. RSS article listing) can target database read-replicas.
3. **Database Partitioning**: Tenant tables can be partitioned or sharded if tenant data volumes grow exponentially.
4. **Service Extraction**: If a specific module (e.g., AI pipeline or RSS ingestion) requires high resource allocation or specific runtime configurations, it can be extracted into its own NestJS service.
