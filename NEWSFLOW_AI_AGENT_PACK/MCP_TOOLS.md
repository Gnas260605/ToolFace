# MCP/Tool nên cấp cho coding agent

## Bắt buộc

### Filesystem

Quyền:

- Đọc toàn bộ repository
- Tạo/sửa file trong repository
- Không được đọc thư mục hệ thống hoặc secret ngoài dự án

Dùng để:

- Inspect kiến trúc
- Tạo source code
- Tạo migration
- Tạo tài liệu

### Terminal

Quyền:

- Chạy `pnpm`, `node`, `docker compose`, test, lint, build
- Không cho phép lệnh phá hủy máy chủ hoặc đọc secret hệ thống

Dùng để:

- Cài dependency
- Chạy migration
- Chạy test
- Chạy container
- Kiểm tra build

### Git

Quyền:

- Xem diff/status/log
- Tạo branch và commit khi người dùng cho phép
- Không force-push
- Không tự merge vào production

### Browser/official-document search

Chỉ ưu tiên:

- Meta for Developers
- Next.js documentation
- NestJS documentation
- Prisma documentation
- BullMQ documentation
- Docker documentation
- PostgreSQL documentation
- OWASP
- Tài liệu chính thức của AI provider

Agent phải ghi ADR khi tài liệu chính thức làm thay đổi spec.

## Nên có

### GitHub

- Đọc issue/PR
- Chạy hoặc xem CI
- Tạo PR sau khi được yêu cầu
- Không thay đổi secrets hoặc branch protection

### PostgreSQL development connector

Chỉ kết nối database local/staging.

- Cho phép inspect schema
- Cho phép migration qua công cụ dự án
- Không cấp production write access cho agent

### Redis development connector

- Inspect queue local/staging
- Không truy cập Redis production chứa token/session nếu không cần

### Error tracking

- Read-only Sentry hoặc hệ thống lỗi cho staging
- Không gửi dữ liệu bài viết/token vào prompt ngoài ý muốn

## Không nên cấp

- Facebook password
- Page access token dạng plaintext trong chat
- Production database admin credential
- Production shell root
- Cloud billing owner role
- Domain registrar access
- Meta Business owner credential
- Quyền tự động đăng fanpage thật trong quá trình phát triển

## Nguyên tắc quyền hạn

Cấp quyền tối thiểu theo phase. Phase 0 không cần Meta token. Phase 2 không cần billing. Phase 4 chỉ nên dùng Page thử nghiệm trước khi qua App Review.
