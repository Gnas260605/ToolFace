# Cách sử dụng Agent Pack

## 1. Đặt các file vào repository

Đặt toàn bộ nội dung pack ở thư mục gốc của dự án:

```text
newsflow-ai/
├─ NEWSFLOW_AI_PRODUCTION_SPEC.md
├─ SYSTEM_PROMPT.md
├─ skills/
├─ .cursor/rules/newsflow.mdc
└─ ...
```

## 2. Với Cursor

- Giữ `.cursor/rules/newsflow.mdc`.
- Mở chat Agent.
- Gửi lệnh phase cụ thể, ví dụ:

```text
Read SYSTEM_PROMPT.md, NEWSFLOW_AI_PRODUCTION_SPEC.md,
skills/01-product-architecture/SKILL.md,
and skills/10-devops-observability/SKILL.md.

Implement Phase 0 only.
Do not start Phase 1.
Run all required verification commands and report observed results.
```

## 3. Với Claude Code

Đặt các nguyên tắc cốt lõi trong `CLAUDE.md` hoặc yêu cầu Claude đọc:

```text
Read SYSTEM_PROMPT.md and NEWSFLOW_AI_PRODUCTION_SPEC.md first.
Then read only the skills required for Phase 0.
Create a phase plan, implement it, run verification, and report truthfully.
```

## 4. Với Codex/agent khác

Dùng `SYSTEM_PROMPT.md` làm system/developer instruction nếu nền tảng hỗ trợ. Nếu không, đặt nó vào file hướng dẫn gốc của repository và yêu cầu agent đọc trước mỗi phase.

## 5. Không yêu cầu code toàn bộ dự án trong một lượt

Thứ tự đề xuất:

1. Phase 0 — foundation
2. Phase 1 — auth và tenancy
3. Phase 2 — ingestion
4. Phase 3 — AI editorial
5. Phase 4 — Facebook integration
6. Phase 5 — scheduling
7. Phase 6 — billing
8. Phase 7 — hardening

Sau mỗi phase, commit riêng. Không cho agent tiếp tục nếu lint, typecheck, test hoặc build chưa chạy thành công.
