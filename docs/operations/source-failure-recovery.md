# Phục hồi lỗi thu thập tin (Source Failure Recovery Operations)

Hệ thống NewsFlow AI tự động giám sát tình trạng sức khoẻ của từng nguồn tin thông qua cơ chế đếm số lỗi liên tiếp (`consecutiveFailures`).

## Phân cấp sức khỏe nguồn tin

* **HEALTHY** (Khỏe mạnh): Lần quét gần nhất thành công.
* **DEGRADED** (Suy giảm): Đạt 2 lần quét lỗi liên tiếp.
* **FAILING** (Lỗi nặng): Đạt 5 lần quét lỗi liên tiếp.
* **AUTO_DISABLED** (Khóa tự động): Đạt 20 lần quét lỗi liên tiếp.

## Cơ chế tự động khóa (Auto-disable)

Khi số lần lỗi liên tiếp vượt quá 20 lần, hệ thống tự động đổi trạng thái nguồn tin thành `AUTO_DISABLED` để dừng lên lịch quét tự động, giảm tải tài nguyên hệ thống và ngăn việc gửi yêu cầu vô ích tới các trang tin bị sập hoặc thay đổi địa chỉ.

## Hướng dẫn phục hồi nguồn tin lỗi

1. Kiểm tra mã lỗi (`lastErrorCode`) và tin nhắn lỗi (`lastErrorMessage`) trực tiếp trên giao diện danh sách nguồn tin.
2. Thử bấm nút **Kiểm tra nguồn tin (Test)** để chuẩn đoán lỗi trực tiếp:
   * **Mã lỗi 403 / 401**: Nguồn tin yêu cầu đăng nhập hoặc chặn User-Agent của NewsFlow AI. Cần liên hệ quản trị viên trang tin hoặc thay đổi feed URL.
   * **Mã lỗi TIMEOUT / FETCH_FAILED**: Server cấp tin gặp sự cố quá tải hoặc mạng chập chờn.
3. Sau khi xác định địa chỉ feed hoạt động trở lại bình thường, bấm nút **Bật (Enable)**:
   * Thao tác này sẽ đặt lại `consecutiveFailures` về 0, chuyển trạng thái sức khỏe về `UNKNOWN` và tiếp tục đưa nguồn tin vào lịch quét tự động nền.
