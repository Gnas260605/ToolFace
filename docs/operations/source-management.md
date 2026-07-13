# Hướng dẫn Vận hành Nguồn cấp tin (Source Management Operations)

Tài liệu hướng dẫn vận hành thiết lập và quản lý các nguồn tin tức RSS/Atom feeds trong hệ thống NewsFlow AI.

## Thêm nguồn cấp tin mới

1. Đăng nhập vào Workspace dưới quyền quản trị (`OWNER` hoặc `ADMIN`).
2. Điều hướng tới menu **Nguồn cấp tin** (`/app/[workspaceSlug]/sources`).
3. Nhấp nút **Thêm nguồn tin** để mở biểu mẫu.
4. Nhập địa chỉ **Feed URL** và nhấp nút **Test** để chạy kiểm tra an toàn kết nối:
   * Nếu URL hợp lệ và nội dung XML chuẩn hoá, hệ thống sẽ điền tự động tên nguồn tin.
   * Nếu URL trỏ đến dải IP nội bộ hoặc XML lỗi, hệ thống sẽ lập tức cảnh báo và chặn nút lưu.
5. Thiết lập chu kỳ quét (`pollIntervalSeconds`):
   * Môi trường phát triển hỗ trợ cấu hình tối thiểu 300 giây (5 phút).
   * Môi trường sản xuất khuyến nghị từ 900 giây (15 phút).
6. Lưu lại cấu hình để kích hoạt quét tự động.

## Kích hoạt Quét tin thủ công (Manual Poll)

Khi cần cập nhật tin bài lập tức mà không chờ đến chu kỳ tiếp theo, người quản lý có thể kích hoạt quét tin thủ công:
* Bấm nút **Quét** tương ứng với nguồn tin tại bảng quản lý.
* Hệ thống sẽ bỏ qua trạng thái chu kỳ và gửi một job độ ưu tiên cao vào hàng đợi `source-poll` ngay lập tức.
