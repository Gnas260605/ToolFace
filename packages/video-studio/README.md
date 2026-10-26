# Video Studio — ảnh + kịch bản → video hoàn chỉnh

Công cụ AI dựng video tự động trong monorepo toolface:

```
ảnh + kịch bản + yêu cầu + phong cách
        │
        ▼
 Claude API (xem ảnh, đọc kịch bản) ──► plan.json  (chia cảnh, chọn ảnh, chuyển động, chuyển cảnh, giọng, hook)
        │
        ▼
 Edge TTS (giọng Việt miễn phí) ──► lời đọc từng cảnh
        │
        ▼
 FFmpeg ──► Ken Burns + chuyển cảnh + phụ đề karaoke + hiệu ứng âm thanh + nhạc nền tự giảm âm ──► MP4 9:16 / 16:9 / 1:1
```

## Cài đặt (Windows)

```powershell
winget install Gyan.FFmpeg        # FFmpeg + ffprobe (mở lại terminal sau khi cài)
pip install edge-tts              # giọng đọc tiếng Việt (cần Internet khi chạy)
pnpm install                      # tại thư mục gốc repo
```

Thêm vào file `.env` ở thư mục gốc repo:

```
ANTHROPIC_API_KEY=sk-ant-...
```

> **⚠️ Chi phí: mỗi lần lên kế hoạch dựng là 1 lượt gọi Claude API có tính phí (ảnh càng nhiều càng tốn). Dùng `--plan-only` để kiểm tra trước, và `--plan plan.json` để render lại mà không gọi API thêm lần nào.**
> Không có API key, công cụ vẫn chạy bằng bộ chia cảnh offline, nhưng không "nhìn" được ảnh.

## Dùng

```powershell
pnpm --filter @newsflow/video-studio studio `
  --images-dir .\anh `
  --script .\kich-ban.txt `
  --request "Video TikTok giới thiệu shop, 30-45 giây, cuối video kêu gọi nhắn tin" `
  --style "năng động, trẻ trung, chuyển cảnh nhanh" `
  --aspect 9:16,16:9,1:1 `
  --music .\nhac.mp3 `
  -o .\output\shop.mp4
```

Kết quả: `output/shop-9x16.mp4`, `shop-16x9.mp4`, `shop-1x1.mp4` (một định dạng thì không thêm hậu tố).

| Tuỳ chọn                       | Ý nghĩa                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `-i, --image` / `--images-dir` | Ảnh đầu vào (lặp `-i` nhiều lần, hoặc cả thư mục, sắp theo tên)              |
| `-s, --script`                 | Kịch bản: file `.txt` hoặc chữ trực tiếp                                     |
| `-r, --request`                | Yêu cầu: nền tảng, độ dài, mục đích, lời kêu gọi                             |
| `--style`                      | Phong cách hình ảnh / nhịp dựng                                              |
| `-a, --aspect`                 | `9:16`, `16:9`, `1:1` — có thể nhiều, cách nhau dấu phẩy                     |
| `--voice`                      | `vi-VN-HoaiMyNeural` (nữ) hoặc `vi-VN-NamMinhNeural` (nam); mặc định AI chọn |
| `--music`                      | Nhạc nền, tự động giảm âm khi có giọng đọc                                   |
| `--no-voice`                   | Chỉ phụ đề, không lồng tiếng                                                 |
| `--plan-only` / `--plan`       | Tạo `plan.json` để xem/sửa tay, rồi render từ file đó                        |
| `--font`, `--fonts-dir`        | Font phụ đề (phải có dấu tiếng Việt). Mặc định Arial trên Windows            |

> **⚠️ Bản quyền: chỉ dùng ảnh và nhạc bạn có quyền sử dụng — TikTok/YouTube/Facebook tắt kiếm tiền hoặc gỡ video dùng nhạc/ảnh của người khác.**

## Phụ đề nổi bật & hiệu ứng âm thanh

- **Karaoke**: dùng thời điểm từng từ do Edge TTS trả về; từ đang được đọc hiện chữ tối trên nền màu nổi bật và to hơn một chút. Dòng chữ mới bật lên (pop-in).
- **Từ khoá** (`emphasis` trong plan, AI tự chọn số liệu, giá, tên sản phẩm…) luôn được tô màu.
- **Hook** đầu video: chữ đen trên khung màu, bật lên kèm tiếng "hit".
- **Âm thanh**: "whoosh" mỗi lần chuyển ảnh, "tick" khi cắt cảnh, "pop" khi dòng phụ đề xuất hiện. Âm được tạo sẵn bằng FFmpeg nên không lo bản quyền; muốn âm khác thì dùng `--sfx-dir`.

## Sửa kế hoạch dựng bằng tay

`plan.json` (nằm trong thư mục `<out>.work/`) mô tả từng cảnh:

```json
{
  "imageIndex": 2,
  "narration": "Lời đọc của cảnh này",
  "caption": "(tuỳ chọn) chữ hiện trên màn hình nếu khác lời đọc",
  "motion": "zoom_in | zoom_out | pan_left | pan_right | pan_up | pan_down | static",
  "fit": "cover | contain_blur",
  "transition": "cut | fade | dissolve | fadeblack | slideleft | slideup | wipeleft | circleopen | smoothleft | zoomin ...",
  "minDuration": 2.5,
  "emphasis": ["50%", "miễn phí"]
}
```

Ngoài ra: `hookText` (tiêu đề lớn 3 giây đầu), `voice`, `speechRate` (`"+10%"`), `captions` (`style`, `box`, vị trí, màu, viết hoa, cỡ chữ), `sfx` (`enabled`, `volume`, `captionPop`), `musicVolume`.

## Dùng trên web (khuyên dùng)

Trong ứng dụng toolface: menu **Video Studio** (`/app/<workspace>/videos`).

1. Tải ảnh, dán kịch bản, chọn yêu cầu / phong cách / khung hình → **Tạo video**.
2. Worker gọi Claude lên kế hoạch, rồi tự dựng **bản xem trước 540p** (vùng bị giao diện TikTok/Reels che được tô đỏ nhạt).
3. Sửa từng cảnh (ảnh, lời đọc, chuyển động, chuyển cảnh, từ khoá), hook, giọng, kiểu phụ đề → **Lưu & dựng xem trước**. Không gọi AI thêm.
4. **Xuất bản cuối (1080p)** cho mọi khung hình đã chọn → tải về + chép caption, hashtag, tiêu đề YouTube.

Có nút Huỷ (dừng FFmpeg trong vài giây), Thử lại khi lỗi, Xoá (xoá cả file trên MinIO).

### Kiến trúc

```
Web (Next.js) ──► API (NestJS) ──► MinIO: ảnh/nhạc gốc
                      │
                      └─► Redis/BullMQ "video-render" ──► Worker
                                                          ├─ plan    : kiểm tra file → Claude (strict tool) → plan
                                                          ├─ render  : Edge TTS → FFmpeg → MinIO
                                                          └─ cập nhật video_jobs (trạng thái, %, lỗi)
```

| Thực hành production            | Cách làm                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Không render trong request HTTP | API chỉ tạo job; worker xử lý, web hỏi trạng thái mỗi 2,5 giây                                                  |
| Retry an toàn                   | 3 lần, backoff 30 s luỹ thừa; lỗi đầu vào / AI từ chối → dừng ngay, không retry                                 |
| Không tốn tiền khi retry        | Cache theo nội dung: plan (hash ảnh + kịch bản + yêu cầu), giọng đọc theo câu, clip từng cảnh                   |
| Huỷ được                        | Cờ `cancel_requested` trong DB, worker kiểm tra 2 s/lần và kill FFmpeg                                          |
| Không treo                      | Mỗi lệnh FFmpeg có timeout (mặc định 10 phút, `VIDEO_STUDIO_CMD_TIMEOUT_MS`)                                    |
| An toàn đầu vào                 | Kiểm tra bằng ffprobe theo nội dung file, giới hạn số ảnh / dung lượng / kích thước; `-protocol_whitelist file` |
| Chi phí AI                      | Kiểm tra hạn mức workspace trước khi gọi; ghi token + chi phí ước tính vào `ai_usage_events`                    |
| Redis                           | Prod dùng AOF + `maxmemory-policy noeviction` như BullMQ yêu cầu                                                |
| Tài nguyên                      | `VIDEO_RENDER_CONCURRENCY` (mặc định 1) mỗi worker; scale bằng thêm container worker                            |

### Biến môi trường

| Biến                                     | Ý nghĩa                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`                      | Bắt buộc để AI xem ảnh và lên kế hoạch                             |
| `VIDEO_PLANNER_MODEL`                    | Mặc định `claude-sonnet-5-5`                                       |
| `VIDEO_PLANNER_USD_PER_MTOK_IN` / `_OUT` | Giá để ước tính chi phí (mặc định 3 / 15)                          |
| `VIDEO_RENDER_CONCURRENCY`               | Số video render song song mỗi worker                               |
| `VIDEO_STUDIO_CACHE_DIR`                 | Thư mục cache (Docker: volume `/var/cache/video-studio`)           |
| `S3_PUBLIC_URL`                          | Địa chỉ MinIO mà trình duyệt truy cập được, nếu khác `S3_ENDPOINT` |

Sau khi kéo code: chạy migration `pnpm --filter @newsflow/database exec prisma migrate deploy` (tạo bảng `video_jobs`).

## Dùng trong code

```ts
import { planVideo, renderPlan } from '@newsflow/video-studio';

const { plan } = await planVideo({ images, script, request, style, aspect: '9:16', workDir });
const { outputs } = await renderPlan({
  plan,
  images,
  aspects: ['9:16', '1:1'],
  quality: 'final',
  output: 'out/video.mp4',
  workDir,
});
```

`createVideo()` gộp cả hai bước (dùng cho CLI).

## Chuẩn đầu ra

- 9:16: phụ đề và hook nằm ngoài vùng giao diện app (trên 14%, dưới 40% gồm cột nút bên phải, hai bên 7%).
- Bản cuối: H.264 High, 30 fps, GOP 15 (closed), 2 B-frame, AAC-LC 48 kHz 320 kbps, `faststart`, độ to −14 LUFS; metadata `comment=Made with AI (toolface video-studio)`.
- Bản xem trước: nửa độ phân giải, mã hoá nhanh.

> **⚠️ Khi đăng, bật nhãn "Nội dung do AI tạo"** — TikTok và YouTube yêu cầu với giọng đọc / hình ảnh tổng hợp trông như thật.

## Phát triển

```bash
pnpm --filter @newsflow/video-studio test       # unit test (cần ffmpeg trên PATH)
pnpm --filter @newsflow/video-studio typecheck
```
