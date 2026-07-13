# Tài liệu Hướng dẫn Kiểm tra Sức khỏe Hệ thống (Health Checks)

API của **NewsFlow AI** cung cấp hai endpoint để kiểm tra sức khỏe và khả năng sẵn sàng phục vụ, hỗ trợ đắc lực cho việc giám sát trạng thái (monitoring) và cấu hình điều phối container (Kubernetes, AWS ECS, Docker Compose).

## Các Endpoints Kiểm tra Sức khỏe

### 1. Kiểm tra Liveness (Trạng thái Sống)

Được dùng để xác nhận tiến trình API đang chạy bình thường.

- **Endpoint**: `GET /health/live`
- **Mã trạng thái phản hồi (HTTP Status)**: `200 OK`
- **Phản hồi mẫu**:

```json
{
  "status": "ok"
}
```

### 2. Kiểm tra Readiness (Mức độ Sẵn sàng)

Được dùng để xác nhận API có kết nối thành công tới tất cả các phụ thuộc chính trước khi cho phép điều phối traffic người dùng vào container.

- **Endpoint**: `GET /health/ready`
- **Tiêu chí Ready**:
  - Kết nối cơ sở dữ liệu PostgreSQL hoạt động bình thường (thông qua truy vấn kiểm tra nhanh từ shared database health service).
  - Kết nối Redis hoạt động bình thường (thông qua lệnh `ping` kiểm tra của Redis client).
  - Biến môi trường hệ thống được cấu hình chính xác và vượt qua kiểm tra định dạng của Zod.
- **Mã trạng thái phản hồi**:
  - `200 OK` — Khi mọi hệ thống hoạt động tốt.
  - `503 Service Unavailable` — Khi bất kỳ phụ thuộc nào gặp sự cố.
- **Phản hồi mẫu (Mọi thứ bình thường - 200 OK)**:

```json
{
  "status": "ok",
  "timestamp": "2026-07-12T13:16:20.841Z",
  "services": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    }
  }
}
```

- **Phản hồi mẫu (Database gặp lỗi kết nối - 503 Service Unavailable)**:

```json
{
  "status": "error",
  "timestamp": "2026-07-12T13:16:20.846Z",
  "services": {
    "database": {
      "status": "down",
      "message": "Can't reach database server at localhost:5432"
    },
    "redis": {
      "status": "up"
    }
  }
}
```

_Lưu ý:_ Endpoint Readiness **không** phụ thuộc vào các dịch vụ bên ngoài như Meta (Facebook) hay nhà cung cấp AI để tránh làm gián đoạn việc khởi chạy API khi các dịch vụ bên thứ ba gặp sự cố ngoại tuyến tạm thời.
