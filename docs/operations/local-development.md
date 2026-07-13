# Hướng dẫn Vận hành & Phát triển Local

Tài liệu này hướng dẫn cách chạy, phát triển và cấu hình môi trường local cho dự án **NewsFlow AI**.

## Yêu cầu Hệ thống

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose

## Khởi động Môi trường Local

### 1. Cấu hình biến môi trường

Sao chép tệp mẫu cấu hình và điều chỉnh nếu cần thiết:

```bash
cp .env.example .env
```

### 2. Cài đặt các gói phụ thuộc (Dependencies)

Chạy lệnh cài đặt từ thư mục gốc của monorepo:

```bash
pnpm install
```

### 3. Khởi động cơ sở hạ tầng phát triển (Docker Compose)

Dùng docker compose để chạy các dịch vụ PostgreSQL, Redis, MinIO và Mailpit:

```bash
docker compose up -d
```

Lệnh này sẽ tự động tạo cơ sở dữ liệu `newsflow`, kết nối Redis và khởi tạo bucket `newsflow-bucket` trên MinIO.

### 4. Đồng bộ cơ sở dữ liệu (Migrations & Client Generation)

Chạy migrations của Prisma để khởi tạo bảng trên PostgreSQL local:

```bash
pnpm --filter @newsflow/database db:migrate
```

Lệnh này cũng tự động tạo Prisma Client dùng chung cho các ứng dụng.

## Khởi động Dự án trong Quá trình Phát triển

Chạy tất cả các ứng dụng (`web`, `api`, `worker`) cùng lúc ở chế độ phát triển:

```bash
pnpm dev
```

Hoặc chạy từng ứng dụng cụ thể:

- **API**: `pnpm --filter api dev` (chạy trên cổng `3001`)
- **Worker**: `pnpm --filter worker dev` (chạy nền)
- **Web UI**: `pnpm --filter web dev` (chạy trên cổng `3000`)

## Các Lệnh Xác nhận Chất lượng Code

- **Format code**: `pnpm format`
- **Kiểm tra Format**: `pnpm format:check`
- **Kiểm tra Lint**: `pnpm lint`
- **Kiểm tra TypeScript compile**: `pnpm typecheck`
- **Chạy Tests**: `pnpm test`
- **Build đóng gói**: `pnpm build`
