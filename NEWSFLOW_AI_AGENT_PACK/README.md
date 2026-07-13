# NewsFlow AI — Agent Skill Pack

Bộ này dùng cùng với `NEWSFLOW_AI_PRODUCTION_SPEC.md` để AI coding agent triển khai NewsFlow AI theo hướng production và SaaS có thể bán lại.

## Thành phần

- `SYSTEM_PROMPT.md`: system prompt chính cho agent.
- `PACKAGE_IMPORTS.md`: package nên dùng theo từng app/module.
- `MCP_TOOLS.md`: quyền/tool nên cấp cho agent.
- `HOW_TO_USE.md`: cách đưa bộ tài liệu cho Cursor, Claude Code hoặc agent khác.
- `.cursor/rules/newsflow.mdc`: rule có thể đặt thẳng vào dự án Cursor.
- `skills/*/SKILL.md`: các skill chuyên biệt, chỉ nạp khi làm đúng module.
- `NEWSFLOW_AI_PRODUCTION_SPEC.md`: đặc tả sản phẩm chính, được chép vào pack để agent luôn có đủ ngữ cảnh.

## Nguyên tắc nạp skill

Không nạp toàn bộ skill vào mọi lượt chat. Agent chính luôn đọc:

1. `SYSTEM_PROMPT.md`
2. `NEWSFLOW_AI_PRODUCTION_SPEC.md`
3. Skill tương ứng với phase đang thực hiện

Ví dụ:

- Phase 0: Product Architecture + DevOps
- Phase 1: SaaS Tenancy/Auth + Database + Testing
- Phase 2: News Ingestion Security + Background Jobs
- Phase 3: AI Editorial Pipeline + Copyright Compliance
- Phase 4: Facebook Pages API + Security + Background Jobs
- Phase 6: Billing Commercialization

Việc nạp theo phase giúp giảm xung đột hướng dẫn và tránh agent tự ý code lan sang module khác.
