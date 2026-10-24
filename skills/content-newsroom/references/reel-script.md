# Kịch bản video ngắn (Reels / TikTok / Shorts)

Dùng khi người dùng muốn chuyển một video (Douyin, Kuaishou, Weibo, TikTok…) hoặc một tin tức thành kịch bản video tiếng Việt.

## Nguồn là video

Làm việc từ **transcript/bản dịch** mà người dùng cung cấp, hoặc mô tả/caption gốc. Nếu không có lời thoại, chỉ mô tả những gì người dùng kể là xảy ra trong video — không bịa diễn biến.

Coi transcript như một nguồn bình thường: vẫn trích xuất fact sheet trước (Bước 1 trong SKILL.md).

## Hai mẫu khung

**Mẫu 1 — Tiêu đề sub vàng** (`template: headline`)
- Tiêu đề in hoa < 12 từ, chữ vàng viền đen ở phía dưới video.
- Hợp với: câu chuyện, tình huống lạ, khoảnh khắc đời thường.

**Mẫu 2 — Banner tin nóng** (`template: banner`)
- Banner màu (đỏ `#E11D48` cho tin nóng, xanh `#2563EB` cho tin thông tin) chiếm phần trên, video ở dưới, có tên page.
- Hợp với: tin xã hội, cảnh báo, sự kiện.

Tiêu đề khung vẫn theo luật trong `writing-style.md`: dùng chi tiết thật, không phóng đại.

## Đầu ra

Ghi vào `work/reel.json`:

```json
{
  "headline": "TIÊU ĐỀ IN HOA NGẮN",
  "template": "headline",
  "bannerColor": "#E11D48",
  "beats": [
    {"t": "0-3s", "onScreen": "chữ trên màn hình", "voiceover": "lời đọc (nếu có)"},
    {"t": "3-10s", "onScreen": "...", "voiceover": "..."}
  ],
  "caption": "Caption đăng kèm, kể chuyện theo nhịp video, kết bằng câu hỏi tự nhiên",
  "attributionLine": "Nguồn video: <kênh/tài khoản gốc>",
  "hashtags": ["#reels", "#xuhuong"]
}
```

Để chạy `verify_draft.py` trên kịch bản, ghép `headline` → `headline`, câu đầu caption → `hook`, toàn bộ voiceover + caption → `body`, rồi lưu thành `work/draft.json`.

## Lưu ý bản quyền (nói với người dùng một lần)

Dịch, gắn khung và thêm caption **không biến video của người khác thành của mình**. Đăng lại có thể bị báo cáo bản quyền, và Facebook/TikTok thường giảm phân phối hoặc loại khỏi kiếm tiền với nội dung "không nguyên bản". Cách an toàn hơn: xin phép tác giả, dùng đoạn ngắn kèm bình luận/phân tích của chính mình, hoặc quay lại nội dung bằng hình ảnh của mình và chỉ lấy câu chuyện làm nguồn tin.
