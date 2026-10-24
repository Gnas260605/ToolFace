# Schema

Các trường không bắt buộc có thể bỏ trống (`[]` hoặc `""`). `verify_draft.py` chấp nhận thiếu trường.

## fact_sheet.json

```json
{
  "sourceClaims": [
    {"text": "Khẳng định trong nguồn", "source": "source-1", "evidence": "đoạn trích ngắn làm bằng chứng", "status": "CONFIRMED"}
  ],
  "entities": [
    {"type": "PERSON", "canonicalName": "Nguyễn Văn A", "aliases": ["anh A"]}
  ],
  "dates": [{"value": "12/10/2026", "context": "ngày xảy ra"}],
  "numbers": [{"value": "24", "unit": "tuổi", "context": "tuổi nhân vật"}],
  "scores": [{"homeTeam": "Việt Nam", "awayTeam": "Thái Lan", "homeScore": 2, "awayScore": 1, "rawText": "2-1"}],
  "quotes": [{"text": "Câu nói nguyên văn trong nguồn", "speaker": "Nguyễn Văn A"}],
  "conflicts": [{"field": "số người bị thương", "values": [{"value": "3", "source": "source-1"}, {"value": "5", "source": "source-2"}]}],
  "uncertaintyFlags": ["Danh tính tài xế chưa được công bố"]
}
```

- `status`: `CONFIRMED` | `CONFLICTING` | `UNCERTAIN`
- `entities[].type`: `PERSON` | `TEAM` | `ORGANIZATION` | `LOCATION` | `EVENT` | `PRODUCT` | `OTHER`

## draft.json

```json
{
  "language": "vi",
  "contentType": "SUMMARY",
  "headline": "TIÊU ĐỀ IN HOA",
  "hook": "Câu mở đầu",
  "body": "Thân bài, các đoạn cách nhau bằng \n\n",
  "whyItMatters": "Vì sao đáng quan tâm",
  "discussionQuestion": "Câu hỏi thảo luận",
  "attributionLine": "Nguồn: VnExpress",
  "recommendedLink": "https://...",
  "hashtags": ["#TinNong", "#XuHuong"],
  "riskFlags": ["UNCONFIRMED"]
}
```

- `contentType`: `BREAKING` | `SUMMARY` | `ANALYSIS` | `RESULT` | `RUMOR` | `TRANSFER` | `MATCH_PREVIEW` | `MATCH_RECAP`
- `riskFlags` gợi ý: `UNCONFIRMED`, `MINOR_INVOLVED`, `LEGAL`, `HEALTH`, `REUPLOADED_VIDEO`
