# NewsFlow AI — Production-Grade Monorepo Foundation

Nền tảng hỗ trợ tổng hợp, biên tập và đăng tin tự động lên Facebook Page một cách an toàn, hiệu quả và tối ưu hóa quy trình tòa soạn.

Dự án hiện đang hoàn thành **Phase 0 — Foundation** (Thiết lập Cơ sở Hạ tầng).

## Tổng quan Kiến trúc

NewsFlow AI được xây dựng dưới cấu trúc **Monorepo** sử dụng `pnpm` workspaces và **Turborepo** để quản lý tiến trình build, lint và test.

```text
newsflow-ai/
├─ apps/
│  ├─ web/          # Next.js App Router (Giao diện người dùng)
│  ├─ api/          # NestJS REST API (Ứng dụng dịch vụ trung tâm)
│  └─ worker/       # NestJS Worker standalone (Xử lý hàng đợi Redis/BullMQ nền)
├─ packages/
│  ├─ config/       # Xác thực biến môi trường thời gian chạy sử dụng Zod
│  ├─ contracts/    # Chia sẻ kiểu dữ liệu phản hồi, schemas và hợp đồng API
│  ├─ database/     # Prisma ORM quản lý cơ sở dữ liệu PostgreSQL
│  ├─ eslint-config/# Cấu hình linter dùng chung cho toàn bộ monorepo
│  └─ tsconfig/     # Cấu hình TypeScript dùng chung
```

Các quyết định thiết kế chi tiết được ghi lại tại [ADR 0001: Initial System Architecture](file:///d:/Individua_Project/ToolFaceAI/docs/decisions/0001-initial-architecture.md).

## Yêu cầu Hệ thống

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose

## Khởi động Nhanh

### 1. Thiết lập Biến Môi trường

```bash
copy .env.example .env
```

Các thiết lập mặc định trong tệp `.env.example` đã được cấu hình tối ưu để chạy ngay lập tức trên local.

### 2. Cài đặt các gói phụ thuộc

```bash
pnpm install
```

### 3. Khởi động docker compose dịch vụ nền

Chạy các cơ sở hạ tầng bổ trợ gồm PostgreSQL, Redis, MinIO và Mailpit:

```bash
docker compose up -d
```

### 4. Đồng bộ bảng và khởi tạo DB (Prisma migration)

Chạy tệp migration đầu tiên để khởi tạo bảng:

```bash
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/newsflow?schema=public"; pnpm --filter @newsflow/database exec prisma migrate dev --name init
```

## Các lệnh phát triển & Kiểm thử chính

Chạy tại thư mục gốc của Monorepo:

- **Chạy chế độ phát triển (Tất cả dịch vụ)**: `pnpm dev`
- **Xây dựng đóng gói (Build sản phẩm)**: `pnpm build`
- **Kiểm tra TypeScript**: `pnpm typecheck`
- **Chạy Kiểm thử (Tests)**: `pnpm test`
- **Kiểm tra Lint**: `pnpm lint`
- **Kiểm tra Định dạng code**: `pnpm format:check`
- **Tự động Sửa định dạng**: `pnpm format`

## Địa chỉ dịch vụ mặc định (Local URLs)

- **Web UI Frontend**: http://localhost:3000
- **API Backend**: http://localhost:3001
- **API Swagger Docs (Dev mode)**: http://localhost:3001/api/docs
- **API Health Liveness check**: http://localhost:3001/health/live
- **API Health Readiness check**: http://localhost:3001/health/ready
- **MinIO Object Storage Console**: http://localhost:9001 (Root user: `minioadmin` / `minioadmin`)
- **Mailpit SMTP Dashboard**: http://localhost:8025

---

## Danh sách Tính năng & Trạng thái các Phase

### 1. Tính năng ĐÃ thực hiện (Phase 0 đến Phase 5)

- **Monorepo & Turborepo (Phase 0)**: Thiết lập workspace độc lập giữa Web, API, Worker và 5 packages dùng chung.
- **Xác thực biến môi trường (Phase 0)**: Kiểm tra chặt chẽ đầu vào biến môi trường bằng Zod trước khi chạy ứng dụng.
- **API Liveness & Readiness (Phase 0)**: Xác thực liveness và kết nối Postgres/Redis trước khi phục vụ.
- **Worker Monitor (Phase 0)**: Tiến trình worker kết nối Redis, theo dõi tài nguyên RAM và trạng thái liveness định kỳ.
- **Vietnamese Web Landing Page (Phase 0)**: Giao diện tiếng Việt đẹp mắt, theo dõi trạng thái online/offline của API trực tiếp.
- **Cơ sở hạ tầng Docker (Phase 0)**: Docker Compose tích hợp sẵn PostgreSQL, Redis, MinIO và Mailpit hoạt động tức thì.
- **Quy trình CI (Phase 0)**: Cấu hình quy trình tự động hóa kiểm soát typecheck, build và tests trên GitHub Actions.
- **Quản lý Tổ chức & Thành viên (Phase 1)**: Cơ chế xác thực, đăng nhập/đăng ký, quản lý phân quyền thành viên trong workspace.
- **Thu thập nguồn tin RSS (Phase 2)**: Tự động tải và phân tích dữ liệu từ các báo uy tín của Việt Nam.
- **Biên tập AI & Kiểm duyệt (Phase 3)**: Trích xuất sự kiện bằng mô hình ngôn ngữ lớn AI, tạo bản nháp bài đăng mạng xã hội, kiểm tra chất lượng và cơ chế phê duyệt.
- **Kết nối Facebook Page & Đăng bài (Phase 4)**: Luồng tích hợp OAuth 2.0 an toàn, mã hóa Token Facebook Page (AES-256-GCM), đăng bài ngay lập tức chống trùng lặp.
- **Lên lịch đăng bài & Thông báo (Phase 5)**: Lịch xuất bản trực quan (Month, Week, Agenda), chuyển đổi múi giờ địa phương an toàn, gửi thông báo đẩy và email cập nhật.

### 2. Tính năng CHƯA thực hiện (Sẽ triển khai trong các Phase sau)

- Quản lý thanh toán, hạn mức và gói dịch vụ SaaS (Phase 6).
- Tối ưu bảo mật nâng cao và tối ưu hóa hiệu năng (Phase 7).

## Khắc phục Sự cố (Troubleshooting)

### Lỗi kết nối PostgreSQL (Can't reach database server)

- Xác nhận container `newsflow-postgres` đang hoạt động: `docker compose ps`
- Kiểm tra xem cổng `5432` có bị chiếm bởi một tiến trình PostgreSQL local khác không. Nếu có, tạm ngắt dịch vụ PostgreSQL local đó hoặc đổi cổng trong tệp `.env`.
