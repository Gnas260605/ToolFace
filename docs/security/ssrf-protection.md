# Cơ chế Phòng chống SSRF (SSRF Protection Guide)

Server-Side Request Forgery (SSRF) là lỗ hổng bảo mật nghiêm trọng xảy ra khi kẻ tấn công có thể ép máy chủ gửi các yêu cầu HTTP/HTTPS độc hại tới mạng nội bộ hoặc các dịch vụ đám mây nhạy cảm.

## Các biện pháp bảo vệ tích hợp trong NewsFlow AI

Hệ thống triển khai bộ lọc mạng an toàn tập trung (`SafeHttpFetcher`) với các cơ chế sau:

### 1. Phân giải DNS độc lập trước khi tạo socket
Mọi URL đầu vào sẽ được giải mã DNS trước khi tạo kết nối. Địa chỉ IP nhận được sẽ được xác thực bằng thư viện `ipaddr.js`.

### 2. Chặn các dải IP nội bộ và đặc biệt
Hệ thống chặn kết nối tới các dải IP sau:
* **Loopback**: `127.0.0.0/8`, `::1`
* **Private Ranges**: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`
* **Link-Local**: `169.254.0.0/16`, `fe80::/10`
* **Cloud Metadata Endpoint**: Chặn cứng IP `169.254.169.254` (IP chứa thông tin cấu hình nhạy cảm của các nhà cung cấp đám mây AWS, GCP, Azure).

### 3. Xác thực lại khi chuyển hướng (Redirect Validation)
Nếu máy chủ ngoài trả về mã trạng thái chuyển hướng (ví dụ: 301, 302), `SafeHttpFetcher` sẽ lấy URL chuyển hướng, thực hiện phân giải DNS lại, kiểm tra IP mới có an toàn không trước khi tiếp tục kết nối. Tối đa 5 lần chuyển hướng.

### 4. Giới hạn tài nguyên thu nhận (Resource Capping)
* Phản hồi RSS XML tối đa: **5 MB**.
* Phản hồi HTML bài viết tối đa: **8 MB**.
* Connection Timeout: **5 giây**.
* Total Request Timeout: **15 giây**.
