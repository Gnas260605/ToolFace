# Xử lý an toàn Nội dung bên ngoài (External Content Handling)

Hệ thống NewsFlow AI coi toàn bộ nội dung nhận được từ các nguồn tin cấp bên ngoài (RSS feeds, HTML bài viết) là nguồn dữ liệu **không tin cậy** và có khả năng chứa các mã tấn công XSS, XML Entity.

## Quy tắc xử lý nội dung độc hại

### 1. XML External Entity (XXE) Protection
Bộ phân tích cú pháp XML (`fast-xml-parser`) được cấu hình để tắt hoàn toàn các bộ vi xử lý thực thể mở rộng và DTD bên ngoài. Các tệp tin XML độc hại chứa payloads dạng `<!ENTITY xxe SYSTEM "file:///etc/passwd">` sẽ bị bỏ qua và không thể thực thi.

### 2. HTML Sanitization (Làm sạch HTML)
Nội dung bóc tách đầy đủ từ các trang tin sẽ được xử lý qua thư viện `sanitize-html` với cấu hình:
* **Tước bỏ hoàn toàn** các thẻ script (`<script>`), style (`<style>`), form (`<form>`), iframe (`<iframe>`).
* Vô hiệu hoá hoàn toàn các thuộc tính kích hoạt hành động Javascript như `onload`, `onclick`, `onerror`.
* Chỉ cho phép lưu giữ văn bản thô tóm tắt (`content_excerpt`) có độ dài giới hạn (2000 ký tự) thay vì lưu giữ mã HTML thô.

### 3. Vô hiệu hóa thực thi Javascript phía Client
Hệ thống hiển thị dữ liệu đã làm sạch trên Frontend mà không sử dụng các lệnh thực thi Javascript động bên trong mã HTML, triệt tiêu hoàn toàn khả năng bị tấn công XSS chéo.
