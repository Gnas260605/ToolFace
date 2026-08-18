# Sơ đồ Luồng Hoạt động Dự án ToolFace (NewsFlow AI)

Tài liệu này mô tả chi tiết kiến trúc và luồng xử lý đăng bài (Publishing Flow) hiện tại của dự án ToolFace, bao gồm cả cơ chế ghi đè thông tin bằng biến môi trường (Environment Variable Override) mới tích hợp.

---

## 1. Tổng quan Kiến trúc

Hệ thống được thiết kế theo mô hình Monorepo chia thành các ứng dụng (`apps`) và thư viện chia sẻ (`packages`):

```mermaid
graph TD
    Client[Client App / Postman] -->|HTTP Requests| API[apps/api NestJS]
    API -->|Prisma Client| DB[(PostgreSQL Database)]
    API -->|Enqueue Jobs| Queue[(Redis / BullMQ)]
    
    Worker[apps/worker Node.js] -->|Process Jobs| Queue
    Worker -->|Prisma Client| DB
    Worker -->|Publish API| FB[Facebook Graph API / Mock]
```

- **`apps/api` (NestJS)**: Cung cấp API phục vụ Client, xử lý Authentication, Authorization, quản lý Brand Profiles và lên lịch bài đăng (Scheduling).
- **`apps/worker` (Node.js)**: Chạy các tiến trình xử lý hàng đợi BullMQ trong nền để tìm kiếm các bài viết đến hạn và đẩy sang tiến trình đăng bài lên các MXH (Facebook).
- **`packages/database`**: Chứa Prisma Client và các Social Providers (Mock hoặc Real Graph API) để tương tác trực tiếp với API Facebook.

---

## 2. Luồng Lên lịch & Đăng bài (Scheduling & Publishing Flow)

Chi tiết luồng hoạt động từ lúc lên lịch bài đăng cho đến khi bài viết được xuất bản thành công lên Facebook:

### Giai đoạn 1: Lên lịch bài đăng (API)

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Controller as scheduling.controller
    participant Eligibility as publishing-eligibility.service
    participant DB as Database (Prisma)
    
    Client ->> Controller: POST /workspaces/:wsId/publications (Lên lịch đăng bài)
    Note over Controller: Xác thực Token & Quyền hạn (MockAuthGuard, PermissionsGuard)
    Controller ->> Eligibility: Gọi check eligibility
    
    alt Có biến môi trường FB_PAGE_ID & FB_PAGE_ACCESS_TOKEN
        Note over Eligibility: Bỏ qua kiểm tra kết nối Facebook Page trong Database
    else Không có biến môi trường
        Eligibility ->> DB: Kiểm tra trạng thái kết nối Page (Trạng thái phải là ACTIVE)
    end
    
    Controller ->> DB: Lưu bài đăng với trạng thái SCHEDULED & Thời gian đăng
    Controller -->> Client: Trả về HTTP 201 (Lên lịch thành công)
```

---

### Giai đoạn 2: Quét bài viết đến hạn (Scheduled Publication Worker)

Mỗi chu kỳ quét (cron job của BullMQ):

```mermaid
sequenceDiagram
    autonumber
    participant ScheduleWorker as scheduled-publication.worker
    participant DB as Database (Prisma)
    participant Queue as Redis Queue
    
    ScheduleWorker ->> DB: Tìm các bài viết ở trạng thái SCHEDULED đã quá hạn đăng
    loop Với mỗi bài viết tìm được
        Note over ScheduleWorker: Xác thực quyền kết nối Facebook Page
        alt Có biến môi trường FB_PAGE_ID & FB_PAGE_ACCESS_TOKEN
            Note over ScheduleWorker: Bỏ qua kiểm tra kết nối Facebook Page trong Database
        else Không có biến môi trường
            ScheduleWorker ->> DB: Xác minh kết nối Page vẫn ACTIVE
        end
        
        ScheduleWorker ->> DB: Cập nhật trạng thái bài viết thành PUBLISHING
        ScheduleWorker ->> Queue: Đẩy job vào queue "facebook-publish"
    end
```

---

### Giai đoạn 3: Đăng bài lên Facebook (Facebook Publish Worker)

```mermaid
sequenceDiagram
    autonumber
    participant FBWorker as facebook-publish.worker
    participant Provider as facebook-pages.provider
    participant DB as Database (Prisma)
    participant FB_API as Facebook Graph API (Real/Mock)
    
    FBWorker ->> FBWorker: Nhận job từ queue "facebook-publish"
    
    alt Có biến môi trường FB_PAGE_ID & FB_PAGE_ACCESS_TOKEN
        Note over FBWorker: Sử dụng ID & Access Token trực tiếp từ môi trường (.env)
    else Không có biến môi trường
        FBWorker ->> DB: Lấy và giải mã Page Access Token từ database
    end
    
    Note over FBWorker: Khởi tạo Provider dựa trên META_PROVIDER (graph hoặc mock)
    
    FBWorker ->> Provider: Gọi publishPagePost(pageId, token, content, images)
    Provider ->> FB_API: POST request đăng bài
    FB_API -->> Provider: Trả về post_id thành công
    
    FBWorker ->> DB: Cập nhật bài viết thành PUBLISHED & Lưu platformPostId
```

---

## 3. Cơ chế Ghi đè bằng Biến môi trường (Environment Overrides)

Để hỗ trợ phát triển nhanh và chạy tự động bài đăng mà không cần thiết lập luồng kết nối OAuth phức tạp trên Database, dự án hỗ trợ cấu hình trực tiếp các biến môi trường trong file `.env`:

```env
# Kích hoạt provider thật thay vì Mock
META_PROVIDER=graph

# Thông tin Fanpage đăng bài ghi đè trực tiếp
FB_PAGE_ID=1206185872579017
FB_PAGE_ACCESS_TOKEN=EAAXFgFy9...
```

Khi cấu hình này tồn tại:
1. **API**: Bỏ qua các bước kiểm tra cấu hình kết nối fanpage trong bảng `PageConnection`.
2. **Scheduled Worker**: Cho phép lên lịch bài đăng mà không bắt buộc workspace phải liên kết fanpage từ trước.
3. **Facebook Worker**: Sử dụng trực tiếp `FB_PAGE_ACCESS_TOKEN` để gọi API Facebook Graph thay vì giải mã token của page liên kết từ database.
