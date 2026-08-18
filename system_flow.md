# Kế Hoạch Nâng Cấp ToolFace Pro Lên Chuẩn Production

> Dự án: ToolFace Pro — Node.js worker + Next.js/NestJS API, Prisma, Playwright, đa nhà cung cấp AI (Gemini/OpenAI/OpenRouter), Facebook Graph API
> Mục tiêu: đưa hệ thống crawl → AI rewrite → duyệt → đăng Facebook đạt chuẩn production-grade (an toàn, ổn định, có khả năng mở rộng)

---

## 1. Tổng quan hiện trạng

Luồng biên tập hiện tại đã đúng hướng:

```
RSS/Source → Draft (AI sinh nội dung) → READY_FOR_REVIEW → APPROVED → Đăng Facebook
```

Điểm mạnh: có bước duyệt thủ công trước khi public, có Fact Sheet trích xuất dữ kiện, kiến trúc Provider Factory cho phép cắm nhiều AI.

Điểm cần xử lý trước khi gọi là "production": tính năng **Quick Publish / Auto-Approve** hiện chưa có guardrail, chưa có cơ chế chống trùng lặp, chưa có fallback provider, secrets chưa được bảo vệ, và worker chưa có hàng đợi job bền vững.

---

## 2. Danh sách hạng mục cần cải thiện

| #   | Hạng mục                      | Vấn đề hiện tại                                             | Rủi ro nếu bỏ qua                              | Mức ưu tiên     |
| --- | ----------------------------- | ----------------------------------------------------------- | ---------------------------------------------- | --------------- |
| 1   | AI Provider interface         | Chưa validate structured output (JSON schema)               | Worker crash khi AI trả sai format             | Cao             |
| 2   | AI fallback chain             | 1 provider fail là dừng cả job                              | Downtime pipeline khi Gemini/OpenAI rate-limit | Cao             |
| 3   | Bảo mật secrets               | API key AI/Facebook lưu ở Workspace Settings chưa rõ mã hoá | Lộ key nếu DB bị truy cập                      | Cao             |
| 4   | Auto-Approve guardrail        | Chưa có ngưỡng trust-score, chưa whitelist nguồn            | Đăng nhầm tin sai/nhạy cảm tự động             | Cao             |
| 5   | Dedup nội dung                | Chưa thấy cơ chế chống crawl/đăng trùng                     | Spam Facebook Page, vi phạm chính sách FB      | Trung bình      |
| 6   | Facebook Graph API resilience | Chưa rõ retry/backoff, refresh token                        | Job treo khi token hết hạn hoặc bị 429         | Trung bình      |
| 7   | Job queue                     | Worker chạy dạng loop/ts-node trực tiếp                     | Khó retry an toàn, khó scale ngang             | Trung bình      |
| 8   | Logging/Observability         | Chưa có log có cấu trúc theo từng job                       | Khó debug khi 1 bài bị kẹt giữa pipeline       | Trung bình      |
| 9   | Testing                       | Chưa rõ có test cho provider/publish flow                   | Regression khi thêm provider mới               | Thấp-Trung bình |

---

## 3. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 1 — Nền tảng an toàn (làm trước tiên)

**1.1 Chuẩn hoá AI Provider interface + validate output**

- File liên quan: `worker/src/providers/ai-provider.interface.ts`, `worker/src/providers/schemas/*.ts`
- Việc làm: định nghĩa interface chung `generate(prompt, factSheet): Promise<StructuredDraft>`; dùng Zod parse/validate output trước khi lưu Draft.
- Thời gian: ~1 ngày
- Kiểm tra: unit test giả lập provider trả JSON sai định dạng → worker phải catch lỗi, không crash, ghi log rõ nguyên nhân.

**1.2 Fallback chain giữa các provider**

- File liên quan: `worker/src/providers/provider-factory.ts`
- Việc làm: khi provider chính lỗi/hết quota → tự động thử provider kế tiếp theo thứ tự cấu hình trong Workspace Settings.
- Thời gian: ~0.5 ngày
- Kiểm tra: tắt giả API key của provider chính, xác nhận job vẫn hoàn thành qua provider phụ.

**1.3 Mã hoá secrets tại Workspace Settings**

- File liên quan: schema Prisma (`prisma/schema.prisma`), `api/src/settings/settings.service.ts`
- Việc làm: mã hoá API key/token trước khi lưu DB (AES hoặc dùng KMS nếu deploy cloud), giải mã khi worker đọc cấu hình.
- Thời gian: ~0.5–1 ngày
- Kiểm tra: query DB trực tiếp, giá trị key phải là ciphertext, không log plaintext ra console/log file.

### Giai đoạn 2 — An toàn xuất bản

**2.1 Guardrail cho Auto-Approve**

- File liên quan: `worker/src/publishing/auto-approve.service.ts`
- Việc làm: chỉ auto-approve khi nguồn tin nằm trong whitelist và trust-score vượt ngưỡng cấu hình; ghi audit log (bài nào, ai bật auto-approve, thời điểm).
- Thời gian: ~1 ngày
- Kiểm tra: thử bài từ nguồn không whitelist → phải rơi về luồng duyệt thủ công, không tự đăng.

**2.2 Dedup nội dung**

- File liên quan: `worker/src/crawler/dedup.service.ts`
- Việc làm: hash URL + nội dung bài gốc, kiểm tra tồn tại trước khi tạo Draft mới.
- Thời gian: ~0.5 ngày
- Kiểm tra: chạy crawler 2 lần cho cùng nguồn, xác nhận không tạo Draft trùng.

**2.3 Resilience cho Facebook Graph API**

- File liên quan: `worker/src/facebook/facebook-publisher.service.ts`
- Việc làm: retry có backoff cho lỗi 429/5xx, tự refresh token khi hết hạn, đánh dấu job failed rõ ràng nếu retry vượt ngưỡng.
- Thời gian: ~1 ngày
- Kiểm tra: giả lập response 429 từ Graph API, xác nhận job retry đúng số lần cấu hình rồi mới fail.

### Giai đoạn 3 — Vận hành lâu dài

**3.1 Chuyển sang job queue (BullMQ + Redis)**

- File liên quan: `worker/src/queue/*`
- Việc làm: thay loop trực tiếp bằng queue có concurrency control, retry, dead-letter queue cho job lỗi liên tục.
- Thời gian: ~1–2 ngày
- Kiểm tra: kill worker giữa chừng khi đang xử lý job, khởi động lại, xác nhận job không bị mất và không bị xử lý trùng.

**3.2 Logging có cấu trúc**

- File liên quan: `worker/src/logger/*` (Pino/Winston)
- Việc làm: log theo jobId xuyên suốt crawl → AI → publish, dễ trace 1 bài viết qua từng bước.
- Thời gian: ~0.5 ngày
- Kiểm tra: theo dõi log của 1 jobId cụ thể, phải thấy đủ các bước từ crawl đến publish hoặc điểm dừng lỗi.

---

## 4. Kế hoạch rollback (git-based)

- Mỗi hạng mục làm trên nhánh riêng: `feat/ai-provider-schema`, `feat/provider-fallback`, `feat/secrets-encryption`, `feat/auto-approve-guardrail`, `feat/dedup`, `feat/fb-resilience`, `feat/job-queue`, `feat/structured-logging`.
- Merge từng nhánh vào `dev`, chạy verify ở bước tương ứng trước khi merge tiếp.
- Trước khi merge `dev` → `main`, tạo tag mốc (vd `pre-production-hardening`) để có thể `git revert` hoặc `git checkout <tag>` nhanh nếu phát sinh lỗi khi chạy thật.
- Với các thay đổi schema Prisma (mã hoá secrets), luôn kèm migration có thể rollback (`prisma migrate` có file down tương ứng hoặc backup DB trước khi chạy).

---

## 5. Thứ tự khuyến nghị thực hiện

1. Giai đoạn 1 (1.1 → 1.2 → 1.3) — bắt buộc trước khi bật bất kỳ tính năng auto-publish nào.
2. Giai đoạn 2 (2.1 → 2.2 → 2.3) — bắt buộc trước khi để Quick Publish/Auto-Approve chạy thật với traffic lớn.
3. Giai đoạn 3 — có thể làm song song hoặc sau khi hệ thống đã chạy ổn định vài tuần, phục vụ mục tiêu scale.
