# Package Imports đề xuất

Không cài tất cả package ngay từ đầu. Cài theo phase, dùng bản stable, commit lockfile, và kiểm tra changelog trước khi nâng major version.

## Root monorepo

```bash
pnpm add -Dw turbo typescript eslint prettier
```

Tùy chiến lược test:

```bash
pnpm add -Dw vitest @vitest/coverage-v8 playwright
```

## Web — Next.js

```bash
pnpm --filter web add next react react-dom
pnpm --filter web add zod react-hook-form @hookform/resolvers
pnpm --filter web add @tanstack/react-query
pnpm --filter web add clsx tailwind-merge lucide-react date-fns
pnpm --filter web add -D tailwindcss @types/node @types/react @types/react-dom
```

Ghi chú:

- Dùng Next.js App Router.
- Không đưa secret hoặc Page token vào client bundle.
- Không bắt buộc TanStack Query cho mọi Server Component; chỉ dùng khi cần client-side server state.

## API — NestJS

```bash
pnpm --filter api add @nestjs/common @nestjs/core @nestjs/platform-express
pnpm --filter api add @nestjs/config @nestjs/swagger @nestjs/terminus
pnpm --filter api add @nestjs/throttler @nestjs/schedule @nestjs/bullmq
pnpm --filter api add reflect-metadata rxjs
pnpm --filter api add zod
pnpm --filter api add argon2 jose
pnpm --filter api add helmet cookie-parser
pnpm --filter api add bullmq ioredis
pnpm --filter api add pino nestjs-pino
pnpm --filter api add -D @nestjs/cli @nestjs/testing supertest
```

Không dùng `csurf` chỉ vì quen thuộc. Chọn cơ chế CSRF còn được duy trì và phù hợp với mô hình session/cookie thực tế, hoặc triển khai signed double-submit cookie có test đầy đủ.

## Database

```bash
pnpm --filter @newsflow/database add @prisma/client
pnpm --filter @newsflow/database add -D prisma
```

Dùng PostgreSQL. Không chuyển sang MongoDB cho dữ liệu lõi vì workflow cần transaction, uniqueness, quan hệ và audit rõ ràng.

## Worker và queue

```bash
pnpm --filter worker add @nestjs/common @nestjs/core @nestjs/config
pnpm --filter worker add @nestjs/bullmq bullmq ioredis
pnpm --filter worker add pino nestjs-pino
pnpm --filter worker add reflect-metadata rxjs
```

BullMQ job phải idempotent và phân biệt lỗi retryable với permanent.

## RSS, HTML và bảo mật URL

```bash
pnpm --filter worker add fast-xml-parser
pnpm --filter worker add @mozilla/readability jsdom sanitize-html
pnpm --filter worker add normalize-url tldts ipaddr.js
```

Có thể dùng `rss-parser` cho MVP, nhưng production fetcher vẫn phải có:

- response-size limit
- timeout
- redirect validation
- private-IP blocking
- XML security tests
- approved-domain rules

## AI provider

Chỉ cài provider đang dùng:

```bash
pnpm --filter worker add openai
```

hoặc:

```bash
pnpm --filter worker add @anthropic-ai/sdk
```

Core domain phụ thuộc `AiProvider` interface, không phụ thuộc SDK trực tiếp.

## Facebook Graph API

Không bắt buộc SDK Facebook phía server. Dùng `fetch`/HTTP client chuẩn giúp:

- kiểm soát timeout
- log redaction
- error mapping
- version configuration
- test mock server

Không thêm package OAuth tùy tiện. Chỉ thêm khi thư viện hỗ trợ đúng Authorization Code flow của Meta và đang được duy trì.

## Object storage

```bash
pnpm --filter api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
pnpm --filter worker add @aws-sdk/client-s3
```

## Email

```bash
pnpm --filter worker add nodemailer
pnpm --filter worker add -D @types/nodemailer
```

## Observability

```bash
pnpm --filter api add @sentry/node prom-client
pnpm --filter worker add @sentry/node prom-client
```

OpenTelemetry chỉ thêm khi phase observability thật sự triển khai để tránh cấu hình nửa vời.

## Testing

```bash
pnpm add -Dw testcontainers
pnpm --filter api add -D supertest
```

Dùng mock HTTP server cho Meta/AI. Không gọi API thật trong CI.

## Billing

Chỉ cài khi làm Phase 6:

```bash
pnpm --filter api add stripe
```

Billing phải nằm sau `BillingProvider` interface. Local development dùng `MockBillingProvider`.

## Package không nên dùng làm nền tảng

- Thư viện auto-post Facebook không rõ nguồn
- SDK lưu token trong browser
- Web scraper bypass Cloudflare/paywall
- Package “AI article spinner”
- Package đã ngừng bảo trì cho auth hoặc crypto
- Package yêu cầu tắt TLS verification
- Package thực hiện retry ẩn mà không hỗ trợ idempotency
