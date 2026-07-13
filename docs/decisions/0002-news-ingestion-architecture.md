# ADR 0002: Architectural Decisions for News Ingestion and Security

## Trạng thái
Approved

## Bối cảnh
Hệ thống **NewsFlow AI** cần thu thập và tổng hợp tin tức tự động từ các nguồn tin bên ngoài để xử lý nội dung. Tuy nhiên, việc nhận và tải nội dung từ các đường dẫn bất kỳ (URLs) do người dùng cung cấp ẩn chứa nhiều rủi ro nghiêm trọng về bảo mật (SSRF, XXE, XSS, Resource Exhaustion) và pháp lý (bản quyền bài viết). Vì thế, hệ thống cần một kiến trúc thu thập tin tức tập trung, an toàn và có khả năng chống trùng lặp đáng tin cậy.

## Quyết định Thiết kế

### 1. Ưu tiên nguồn RSS/Atom chính thức, tắt cơ chế Scraping tùy ý
* **Quyết định**: Hệ thống chỉ chấp nhận thu thập tin từ các nguồn cấp tin RSS/Atom chính thức hoặc API được phê duyệt. Tắt tính năng tự động cào (scraping) bất kỳ website nào.
* **Lý do**: Đảm bảo cấu trúc dữ liệu đầu vào chuẩn hóa, tối ưu băng thông và giảm thiểu rủi ro pháp lý liên quan đến bản quyền nội dung.

### 2. Bộ nạp dữ liệu HTTP tập trung và an toàn (Centralized Safe Http Fetcher)
* **Quyết định**: Tất cả các yêu cầu tải dữ liệu bên ngoài (RSS feeds, trích xuất trang bài viết) phải đi qua một lớp kiểm soát an toàn duy nhất (`SafeHttpFetcher`). Lớp này thực hiện:
  * Phân giải DNS độc lập và chặn các kết nối đến dải IP riêng tư/nội bộ (SSRF Protection).
  * Kiểm tra lại IP của điểm chuyển hướng (Redirect validation) trước khi đi tiếp.
  * Giới hạn kích thước phản hồi (Feed tối đa 5MB, Trang HTML tối đa 8MB) và thời gian chờ (Timeout).
  * Vô hiệu hóa phân giải Entity trong XML (chống XXE).
  * Không thực thi JavaScript để triệt tiêu mã độc phía máy khách.

### 3. Trích xuất trang bài viết (Page Extraction) tùy chọn (Opt-in)
* **Quyết định**: Tính năng trích xuất bài viết chỉ được thực hiện khi nguồn tin đó được bật `allowPageExtraction`.
* **Lý do**: Không phải trang tin nào cũng cho phép hoặc yêu cầu tải nội dung đầy đủ. Việc này giúp tiết kiệm tài nguyên và tôn trọng chính sách thu thập tin của nguồn phát.

### 4. Không lưu trữ toàn bộ nội dung bài viết theo mặc định
* **Quyết định**: Hệ thống chỉ lưu trữ tiêu đề, tóm tắt và một đoạn trích ngắn (`content_excerpt`) từ RSS hoặc bài viết.
* **Lý do**: Tuân thủ luật bản quyền sở hữu trí tuệ, tránh các rắc rối pháp lý khi lưu trữ toàn văn mà không được phép, đồng thời giảm dung lượng lưu trữ cơ sở dữ liệu.

### 5. Chống trùng lặp bài viết đa tầng (Multi-layer Duplicate Detection)
Hệ thống xác định trùng lặp qua 4 cấp độ:
* **Tầng 1 (Exact URL)**: So sánh `workspace_id` và canonical URL đã chuẩn hóa.
* **Tầng 2 (Content Hash)**: Băm mã SHA-256 phần tóm tắt nội dung bài viết.
* **Tầng 3 (Title Hash)**: Chuẩn hóa tiêu đề bài viết và băm chuỗi để so sánh chính xác.
* **Tầng 4 (Title Similarity)**: Tính toán mức độ trùng lặp từ khóa tiêu đề (Token Jaccard Overlap) trong khung thời gian 24-48 giờ.

### 6. Gom nhóm bài viết (Story Clustering) tuyến tính
* **Quyết định**: Các bài viết tương tự nhau sẽ được liên kết vào cùng một `StoryCluster` sử dụng phương pháp tính độ tương đồng từ khóa thuần túy thay vì sử dụng mô hình Vector Embeddings ngoại vi trong giai đoạn này.
* **Hướng phát triển tương lai**: Thiết kế giao diện dịch vụ dạng Interface (`StoryClusteringService`) để dễ dàng nâng cấp lên các thuật toán gom nhóm bằng AI học máy / Vector DB trong Phase 3 mà không cần viết lại mã nguồn ứng dụng.

### 7. Thiết kế hàng đợi và tự động retry (BullMQ)
* **Quyết định**: Sử dụng BullMQ để chạy tác vụ quét nguồn tin và trích xuất.
* **Lý do**: Cung cấp cơ chế phân phối tải tốt, khóa phân tán giữa các worker, hỗ trợ retry có giãn cách tăng dần (Exponential backoff) kèm nhiễu (Jitter), phân biệt lỗi tạm thời (retryable) và lỗi vĩnh viễn (permanent) để tự động hạ cấp tình trạng nguồn tin (`degraded`, `failing`).
