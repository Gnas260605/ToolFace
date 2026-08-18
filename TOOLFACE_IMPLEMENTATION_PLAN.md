# TOOLFACE (NewsFlow AI) — IMPLEMENTATION PLAN
> Nguồn: review thủ công repo `https://github.com/Gnas260605/ToolFace.git` (nhánh mặc định, snapshot ngày 2026-08-18).
> Đây là plan dành cho một AI Coding Assistant khác (Gemini/Antigravity) thực thi. Đọc tuần tự, KHÔNG bỏ qua thứ tự Component vì các bước có phụ thuộc (DB/interface → guard/middleware → controller/worker → config).

---

# 1. Tổng quan các vấn đề (Overview of Issues)

## 🔴 Nghiêm trọng (Critical — chặn production, phải sửa trước khi deploy thật)

| # | Vấn đề | File chính |
|---|---|---|
| C1 | **Không có xác thực thật (no real authentication)**. Toàn bộ hệ thống dùng `MockAuthGuard`, tin tưởng mù quáng vào các header client tự gửi (`x-user-id`, `x-user-role`, `x-system-role`, `x-workspace-id`) để xác định danh tính và quyền — bất kỳ ai gọi API cũng có thể tự xưng là `OWNER` hoặc `SYSTEM_ADMIN` chỉ bằng cách set header. | `apps/api/src/common/auth.guard.ts` |
| C2 | **Rò rỉ access token qua URL**: OAuth callback của Facebook redirect kèm `temp_token=<access_token>` trong query string. Token này sẽ nằm trong lịch sử trình duyệt, Referer header, access log của server/CDN. Chính comment trong code cũng thừa nhận đây là sai ("never expose the token in the URL") nhưng vẫn làm. | `apps/api/src/facebook.controller.ts` (dòng ~105-111) |
| C3 | **Phá vỡ cách ly multi-tenant (tenant isolation) qua ENV fallback token Facebook**: Nếu `FB_PAGE_ACCESS_TOKEN`/`FB_PAGE_ID` được set ở ENV, (a) worker sẽ dùng token này để publish thay cho token riêng của workspace khi decrypt lỗi hoặc không có kết nối, và (b) `listConnectedPages` tự động "chèn" page này vào danh sách của **mọi** workspace. Kết hợp với C1, bất kỳ workspace nào cũng có thể publish lên page Facebook dùng chung này. | `apps/worker/src/processors/facebook-publish.worker.ts`, `apps/api/src/facebook.controller.ts` (`listConnectedPages`) |
| C4 | **Tin tưởng header để ghi nhận danh tính hành động**: `connectedByUserId`, `assertActionAllowed(...userId)` lấy trực tiếp từ header `x-user-id` do client gửi, không verify — audit log/billing usage có thể bị giả mạo. | `apps/api/src/facebook.controller.ts` (`connectPage`) |
| C5 | **`NODE_ENV` mặc định là `'development'`** trong schema Zod. Nếu người vận hành quên set `NODE_ENV=production` khi deploy, Swagger UI (`/api/docs`) sẽ tự động bật, lộ toàn bộ schema API. | `packages/config/src/index.ts`, `apps/api/src/main.ts` |
| C6 | **Mật khẩu mặc định yếu trong docker-compose PRODUCTION**: `POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}`, `MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-minioadmin}`. Nếu quên set biến môi trường, hệ thống chạy production với mật khẩu đoán được. | `docker-compose.prod.yml` |

## 🟡 Trung bình (Medium)

| # | Vấn đề | File chính |
|---|---|---|
| M1 | `PermissionsGuard` chỉ kiểm tra **role** (OWNER/ADMIN/...) chứ không kiểm tra `user.workspaceId` (định danh xác thực) có khớp với `:workspaceId` trên route hay không → khi C1 được vá bằng auth thật, vẫn cần thêm bước so khớp workspace để chặn truy cập chéo tenant (horizontal privilege escalation). | `apps/api/src/common/auth.guard.ts` |
| M2 | `tokenFingerprint` bị hard-code cứng thành chuỗi `'fingerprint_placeholder'` thay vì tính hash thật từ token → mọi cơ chế phát hiện trùng lặp / thu hồi theo fingerprint sau này sẽ luôn coi mọi token là "giống nhau", âm thầm sai mà không lỗi. | `apps/api/src/facebook.controller.ts` (`connectPage`) |
| M3 | **Không có rate limiting / throttling** ở tầng API cho các endpoint tốn kém (AI generate draft, publish Facebook) — dễ bị lạm dụng gây tốn chi phí AI hoặc spam publish. Không thấy `@nestjs/throttler` hay middleware tương đương trong `package.json`. | `apps/api/src/main.ts`, `apps/api/package.json` |
| M4 | **N+1 query** trong vòng lặp xử lý từng article khi poll nguồn: với mỗi entry, thực hiện tối thiểu 2 lượt `findFirst` riêng lẻ (check canonical URL, check content/title hash) thay vì batch — hiệu năng kém khi nguồn có nhiều bài. | `apps/worker/src/processors/source-poll.processor.ts` |

## 🟢 Thấp (Low)

| # | Vấn đề | File chính |
|---|---|---|
| L1 | `resolveIp()` trong `safeFetch` chỉ resolve và dùng **một** địa chỉ IP đầu tiên trả về từ DNS; nếu domain có nhiều bản ghi A/AAAA (một public, một private), thứ tự trả về không đảm bảo — nên duyệt và loại toàn bộ IP private thay vì chỉ IP đầu tiên. Rủi ro thấp vì đã enforce resolve-once-connect-by-ip (không bị TOCTOU rebinding cổ điển), nhưng vẫn nên duyệt hết dải IP trả về cho chắc. | `packages/database/src/ingestion/safe-http-fetcher.ts` |

---

# 2. Đánh giá kiến trúc & Rủi ro (Architecture & Risk Assessment)

**Nguyên nhân gốc rễ:** Dự án được xây dựng theo hướng "mock-first" — `MockAuthGuard`, `MockFacebookPagesProvider`, và các fallback ENV (`FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`) rõ ràng được tạo ra để dev/test nhanh mà không cần hệ thống auth thật hay OAuth thật. Vấn đề là các "lối tắt" (shortcut) này **không hề bị chặn hay tắt bởi biến môi trường production**, và được import/sử dụng làm guard chính thức (`@UseGuards(MockAuthGuard, PermissionsGuard)`) trên **tất cả** các controller nghiệp vụ (drafts, sources, facebook, scheduling, brand-profiles, ai-usage, phase6, publish). Điều này biến toàn bộ lớp phân quyền (permission model khá chi tiết và đúng đắn về mặt logic trong `PermissionsGuard`) trở nên vô nghĩa, vì "danh tính" đầu vào của guard đó hoàn toàn do client tự khai báo.

Về mặt kiến trúc, phần **encryption token Facebook** (`SecretEncryptionService`, AES-256-GCM, AAD ràng buộc theo `workspaceId:pageId`, versioned key) và phần **SSRF protection** (`safeFetch`: chặn IP private/loopback/link-local, ép DNS resolve rồi connect trực tiếp bằng IP, SNI/Host tách biệt, giới hạn byte/timeout/redirect) đều được thiết kế khá tốt và đúng best-practice — đây là điểm mạnh cần giữ nguyên, không cần viết lại.

Rủi ro tổng thể: nếu deploy đúng như hiện trạng, **bất kỳ ai gọi API cũng có thể đọc/ghi dữ liệu của bất kỳ workspace nào, tự phong mình làm SYSTEM_ADMIN, và publish bài lên Facebook Page** (nếu có ENV fallback) mà không cần đăng nhập. Đây là mức độ rủi ro "hoàn toàn không có auth", không phải "auth có lỗ hổng nhỏ" — cần ưu tiên tuyệt đối trước khi làm bất kỳ việc gì khác.

---

# 3. Kế hoạch triển khai chi tiết (Detailed Implementation Plan)

> Thứ tự thực hiện bắt buộc: **(A) Database/schema trước → (B) Guard/middleware auth thật → (C) Sửa từng controller/worker đang phụ thuộc mock → (D) Config/hardening → (E) Dọn dẹp N+1 & fingerprint**.

---

### A. Xây dựng lớp Authentication thật (nền tảng bắt buộc cho mọi bước sau)

- **Mục tiêu:** Thay `MockAuthGuard` bằng cơ chế xác thực thật dựa trên JWT (access token ký server-side), lấy `userId`/`workspaceId`/`role` từ token đã verify chứ không phải từ header client tự khai.

#### [MODIFY] `packages/config/src/index.ts`
- **Vấn đề hiện tại:** `serverSchema` không có biến `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, và `NODE_ENV` có `.default('development')` khiến production dễ bị chạy nhầm ở chế độ dev nếu quên set biến môi trường.
- **Giải pháp đề xuất:**
  1. Thêm vào `serverSchema`:
     ```
     JWT_ACCESS_SECRET: z.string().min(32),
     JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
     JWT_REFRESH_SECRET: z.string().min(32),
     JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
     ```
     Không đặt `.default()` cho hai secret này — bắt buộc phải có giá trị thật, nếu thiếu thì `parseEnv` sẽ throw ngay khi bootstrap (fail-fast), tránh chạy production với secret rỗng.
  2. Bỏ `.default('development')` khỏi `NODE_ENV`, đổi thành bắt buộc: `NODE_ENV: z.enum(['development', 'production', 'test'])` (không default). Cập nhật `.env.example` và `.env.prod.example` để luôn khai báo rõ `NODE_ENV=production`.
- **Hướng dẫn cho AI:** Tìm `export const serverSchema = z.object({`, thêm các field JWT phía trên `LOG_LEVEL`. Sửa dòng `NODE_ENV: z.enum([...]).default('development')` thành không có `.default(...)`. Cập nhật cả `.env.example` và `.env.prod.example` (thêm dòng `JWT_ACCESS_SECRET=`, `JWT_REFRESH_SECRET=`, và đảm bảo có dòng `NODE_ENV=production` trong file `.env.prod.example`).

#### [MODIFY] `docker-compose.prod.yml`
- **Vấn đề hiện tại:** `POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}` và `MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-minioadmin}` có fallback mật khẩu yếu, đoán được.
- **Giải pháp đề xuất:** Bỏ giá trị fallback, bắt buộc biến môi trường phải tồn tại: đổi `${DB_PASSWORD:-postgres}` thành `${DB_PASSWORD:?DB_PASSWORD is required}` và tương tự cho `${S3_SECRET_KEY:?S3_SECRET_KEY is required}`. Cú pháp `${VAR:?message}` của Docker Compose sẽ khiến `docker compose up` thất bại ngay với thông báo rõ ràng nếu thiếu biến, thay vì âm thầm dùng mật khẩu yếu.
- **Hướng dẫn cho AI:** Tìm chính xác 2 dòng nêu trên trong `docker-compose.prod.yml` và thay thế cú pháp fallback bằng cú pháp bắt buộc (`:?`).

#### [NEW] `packages/database/src/security/session-token.service.ts`
- **Mục đích:** Cung cấp service ký/giải mã JWT access & refresh token, dùng chung cho API và (nếu cần) worker.
- **Cấu trúc cần có:**
  - Dùng thư viện `jsonwebtoken` (thêm vào `package.json` của `packages/database` hoặc `packages/config` nếu chưa có).
  - Class `SessionTokenService` với 2 method:
    - `signAccessToken({ userId, workspaceId, role, systemRole }): string` — ký JWT với `JWT_ACCESS_SECRET`, thuật toán `HS256`, `expiresIn: JWT_ACCESS_TTL_SECONDS`, payload gồm `sub` (userId), `workspaceId`, `role`, `systemRole`, `iat`, `exp`.
    - `verifyAccessToken(token: string): { userId, workspaceId, role, systemRole } | null` — verify chữ ký + hạn, trả về `null` nếu invalid/expired thay vì throw (để guard tự quyết định response 401).
  - Ghi rõ trong docstring: **workspaceId trong token là workspace mà user đăng nhập lần gần nhất chọn; với các API multi-workspace, vẫn phải kiểm tra user có phải thành viên của `:workspaceId` trên route hay không (xem bước B2) — token KHÔNG phải là nguồn chân lý duy nhất cho quyền truy cập workspace.**

#### [MODIFY] `apps/api/src/common/auth.guard.ts`
- **Vấn đề hiện tại:** `MockAuthGuard` (dòng 27-49) đọc `x-user-id`, `x-user-role`, `x-system-role`, `x-workspace-id` trực tiếp từ header và gán vào `request.user` mà không xác thực gì cả. Đây là guard chính đang được `@UseGuards(MockAuthGuard, PermissionsGuard)` dùng ở **9 controller** khác nhau.
- **Giải pháp đề xuất:**
  1. Tạo class mới `JwtAuthGuard implements CanActivate`:
     - Đọc `Authorization: Bearer <token>` header (không phải cookie tự khai, không phải `x-user-id`).
     - Nếu thiếu header hoặc format sai → `throw new UnauthorizedException('Missing or invalid Authorization header')`.
     - Gọi `sessionTokenService.verifyAccessToken(token)`; nếu `null` → `throw new UnauthorizedException('Invalid or expired token')`.
     - Gán `request.user = { id: payload.userId, role: payload.role, workspaceId: payload.workspaceId, systemRole: payload.systemRole }`.
  2. **Giữ nguyên `MockAuthGuard`** trong file (không xóa) nhưng:
     - Đổi tên thành `MockAuthGuard` → giữ nguyên, nhưng bọc toàn bộ `canActivate` trong điều kiện: chỉ hoạt động khi `process.env.NODE_ENV !== 'production'` **và** `process.env.ALLOW_MOCK_AUTH === 'true'` (biến môi trường phải set tường minh, không default `true`). Nếu điều kiện không thỏa và đang ở guard này → `throw new ForbiddenException('MockAuthGuard is disabled outside development')`. Việc này để code cũ trong test/dev vẫn chạy được nhưng **không thể vô tình bật ở production**.
  3. Export thêm `JwtAuthGuard` để dùng ở bước C.
- **Hướng dẫn cho AI:** Thêm `import { SessionTokenService } from '@newsflow/database';` (hoặc đường dẫn tương ứng sau khi tạo file ở bước NEW phía trên). Viết class `JwtAuthGuard` mới ngay dưới `MockAuthGuard`. Sửa `canActivate` của `MockAuthGuard` để thêm guard-clause kiểm tra `NODE_ENV`/`ALLOW_MOCK_AUTH` ở đầu hàm, throw `ForbiddenException` nếu không thỏa mãn, trước khi chạy logic đọc header như cũ (logic cũ giữ nguyên cho môi trường dev/test).

#### [MODIFY] `apps/api/src/common/auth.guard.ts` (tiếp — PermissionsGuard)
- **Vấn đề hiện tại (M1):** `PermissionsGuard.canActivate` (dòng 55-140) chỉ dùng `user.role`/`user.systemRole` để xét quyền, không so khớp `user.workspaceId` với `:workspaceId` trên route — một user hợp lệ của workspace A có thể gọi API với route `/workspaces/{workspaceId-cua-B}/...` và vẫn pass nếu role đủ điều kiện.
- **Giải pháp đề xuất:** Ngay đầu `canActivate`, sau khi lấy `user`, thêm bước:
  ```
  const routeWorkspaceId = request.params.workspaceId;
  if (routeWorkspaceId && user.workspaceId !== routeWorkspaceId && user.systemRole !== SYSTEM_ADMIN_ROLE) {
    throw new ForbiddenException('User does not belong to this workspace');
  }
  ```
  Cho phép `SYSTEM_ADMIN_ROLE` bỏ qua kiểm tra này (vì admin hệ thống có thể cần truy cập nhiều workspace — nhưng chỉ khi các endpoint đó thực sự dành cho system admin, permission `admin.*` đã lọc riêng ở nhánh trên).
- **Hướng dẫn cho AI:** Chèn đoạn kiểm tra này ngay sau dòng `const user = request.user;` và trước khối `if (!user) { throw ... }` hiện có (đặt sau khối null-check đó, vì cần `user` không null trước khi đọc `user.workspaceId`).

---

### B. Sửa OAuth Facebook — không rò rỉ token qua URL

- **Mục tiêu:** Loại bỏ hoàn toàn việc truyền access token qua query string, dùng session tạm lưu server-side.

#### [MODIFY] `apps/api/src/facebook.controller.ts`
- **Vấn đề hiện tại:** Dòng 108-111, `oauthCallback` redirect kèm `?connected=true&temp_token=${authData.accessToken}` — token nằm trần trong URL.
- **Giải pháp đề xuất:**
  1. Sau khi `exchangeAuthorizationCode` thành công, thay vì trả token qua URL: tạo một `sessionId` ngẫu nhiên (`randomBytes(32).toString('hex')`), lưu `authData.accessToken` vào Redis (dùng `RedisService` đã có sẵn tại `apps/api/src/common/redis.service.ts`) với key `fb:temp_token:{sessionId}`, TTL 600 giây (10 phút — khớp thời gian sống state cũ).
  2. Redirect về `${webUrl}/app/${oauthState.workspaceId}/settings/facebook-pages?connected=true&session_id=${sessionId}` — không còn token trong URL.
  3. Sửa `listAvailablePages` (endpoint `GET available-pages`, dòng 142-151): đổi tham số nhận vào từ `@Query('temp_token') tempToken` thành `@Query('session_id') sessionId`. Trong hàm, đọc token từ Redis bằng `sessionId` (`redis.get('fb:temp_token:' + sessionId)`), nếu không tìm thấy → `throw new BadRequestException('Session expired or invalid, please reconnect Facebook')`. Sau khi dùng xong (đã lấy được danh sách pages), **xóa key khỏi Redis ngay** (`redis.del(...)`) để token tạm không tồn tại lâu hơn mức cần thiết — one-time use.
- **Hướng dẫn cho AI:** Import `RedisService` vào `FacebookOauthController` và `FacebookPagesController` qua constructor injection (giống cách `DatabaseService` đang được inject). Thay toàn bộ đoạn redirect ở `oauthCallback` và toàn bộ tham số `temp_token` ở `listAvailablePages` theo mô tả trên. Đảm bảo phía frontend (`apps/web`) — tìm file xử lý trang `settings/facebook-pages` — cũng được cập nhật để đọc `session_id` thay vì `temp_token` từ query string (grep `temp_token` trong `apps/web/src` để tìm chỗ cần sửa tương ứng).

---

### C. Sửa cách ly multi-tenant cho Facebook publish

- **Mục tiêu:** Loại bỏ khả năng một workspace publish "nhờ" credential toàn cục không thuộc về mình; nếu vẫn muốn giữ tính năng ENV fallback cho mục đích demo/single-tenant, phải giới hạn rõ ràng bằng cấu hình, không áp dụng ngầm cho mọi workspace.

#### [MODIFY] `apps/worker/src/processors/facebook-publish.worker.ts`
- **Vấn đề hiện tại:** Dòng 99-107, nếu decrypt token của `pageConnection` thất bại hoặc không có connection, worker tự động dùng `process.env.FB_PAGE_ACCESS_TOKEN`/`FB_PAGE_ID` để publish — bất kể `workspaceId` của job là gì.
- **Giải pháp đề xuất:** Thêm biến môi trường mới `FB_ENV_FALLBACK_WORKSPACE_ID` (khai báo trong `packages/config`). Chỉ cho phép dùng ENV fallback khi `workspaceId` của job **trùng khớp chính xác** với `FB_ENV_FALLBACK_WORKSPACE_ID`. Nếu không khớp (hoặc biến không được set) → không fallback, thay vào đó gọi `markJobFailed(publishJobId, 'NO_CONNECTION', 'FACEBOOK_PAGE_NOT_CONNECTED', 'Workspace has no active Facebook page connection')`.
- **Hướng dẫn cho AI:** Sửa điều kiện `if (!token && process.env.FB_PAGE_ACCESS_TOKEN && process.env.FB_PAGE_ID)` thành thêm `&& workspaceId === process.env.FB_ENV_FALLBACK_WORKSPACE_ID`. Thêm nhánh `else` gọi `markJobFailed` khi không đủ điều kiện fallback.

#### [MODIFY] `apps/api/src/facebook.controller.ts`
- **Vấn đề hiện tại:** Dòng 223-237, `listConnectedPages` tự chèn "Fanpage từ ENV" vào kết quả cho **mọi** workspace nếu `FB_PAGE_ID` được set.
- **Giải pháp đề xuất:** Áp dụng cùng điều kiện `FB_ENV_FALLBACK_WORKSPACE_ID` như trên: chỉ chèn page ENV vào response khi `workspaceId === process.env.FB_ENV_FALLBACK_WORKSPACE_ID`.
- **Hướng dẫn cho AI:** Bọc khối `if (process.env.FB_PAGE_ID) { ... }` (dòng 223) bằng điều kiện `if (process.env.FB_PAGE_ID && workspaceId === process.env.FB_ENV_FALLBACK_WORKSPACE_ID)`.

#### [MODIFY] `apps/api/src/facebook.controller.ts` (connectPage — C4, danh tính người thực hiện)
- **Vấn đề hiện tại:** Dòng 158 và 160, `@Headers('x-user-id') userId: string` được dùng trực tiếp cho `assertActionAllowed` và lưu vào `connectedByUserId` — sau khi bước A hoàn tất, header này không còn đáng tin (và với `JwtAuthGuard` thật, client không nên tự set header định danh nữa).
- **Giải pháp đề xuất:** Bỏ tham số `@Headers('x-user-id') userId`, thay bằng lấy `req.user.id` từ `request.user` (đã được `JwtAuthGuard` gán ở bước A). Cần thêm `@Req() req: any` vào chữ ký hàm `connectPage`.
- **Hướng dẫn cho AI:** Sửa chữ ký `connectPage(@Param('workspaceId') workspaceId: string, @Body() body: {...}, @Headers('x-user-id') userId: string)` thành thêm `@Req() req: RequestWithUser` và bỏ tham số header; bên trong hàm thay mọi chỗ dùng biến `userId` bằng `req.user?.id`. Áp dụng tương tự cho **bất kỳ controller nào khác** đang dùng `@Headers('x-user-id')` để xác định người thực hiện hành động — chạy `grep -rn "Headers('x-user-id')" apps/api/src` để liệt kê đầy đủ và sửa từng chỗ theo cùng pattern.

#### [MODIFY] `apps/api/src/facebook.controller.ts` (M2 — tokenFingerprint)
- **Vấn đề hiện tại:** Dòng 190, `tokenFingerprint: 'fingerprint_placeholder'` — giá trị cố định, không phản ánh token thật.
- **Giải pháp đề xuất:** Tính fingerprint bằng `createHash('sha256').update(tokenToEncrypt).digest('hex').slice(0, 16)` (đã có sẵn `createHash` import ở đầu file) — dùng làm giá trị không đảo ngược được nhưng đủ để so sánh trùng token/audit mà không lưu token gốc.
- **Hướng dẫn cho AI:** Thay dòng `tokenFingerprint: 'fingerprint_placeholder',` bằng `tokenFingerprint: createHash('sha256').update(tokenToEncrypt).digest('hex').slice(0, 16),`.

---

### D. Áp dụng `JwtAuthGuard` vào tất cả controller & thêm rate limiting

- **Mục tiêu:** Chuyển toàn bộ 9 controller đang dùng `@UseGuards(MockAuthGuard, PermissionsGuard)` sang `@UseGuards(JwtAuthGuard, PermissionsGuard)`, và thêm throttling cho các endpoint tốn kém.

#### [MODIFY] (áp dụng cho từng file sau — cùng một thay đổi lặp lại)
`apps/api/src/articles.controller.ts`, `apps/api/src/sources.controller.ts`, `apps/api/src/ai-usage.controller.ts`, `apps/api/src/publish.controller.ts`, `apps/api/src/facebook.controller.ts`, `apps/api/src/scheduling.controller.ts`, `apps/api/src/phase6.controller.ts`, `apps/api/src/drafts.controller.ts`, `apps/api/src/brand-profiles.controller.ts`
- **Vấn đề hiện tại:** Mỗi file có dòng `import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';` và một hoặc nhiều `@UseGuards(MockAuthGuard, PermissionsGuard)`.
- **Giải pháp đề xuất:** Đổi import thành `import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';` và đổi mọi `@UseGuards(MockAuthGuard, PermissionsGuard)` thành `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
- **Hướng dẫn cho AI:** Chạy tìm-thay-thế (find & replace) chính xác chuỗi `MockAuthGuard, PermissionsGuard` → `JwtAuthGuard, PermissionsGuard` trên toàn bộ 9 file liệt kê trên (bao gồm cả dòng import và dòng decorator). Sau khi sửa, chạy `grep -rn "MockAuthGuard" apps/api/src --include="*.ts" | grep -v spec` để xác nhận **không còn** controller nghiệp vụ nào dùng `MockAuthGuard` (chỉ còn định nghĩa class trong `auth.guard.ts`).

#### [NEW] `apps/api/src/common/throttler.config.ts`
- **Mục đích:** Cấu hình rate limit chung cho API, đặc biệt các endpoint AI generate và publish Facebook.
- **Cấu trúc cần có:**
  - Thêm package `@nestjs/throttler` vào `apps/api/package.json`.
  - Export `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])` làm giới hạn mặc định toàn cục (100 request/phút/IP).
  - Trong `drafts.controller.ts`, tại endpoint generate draft (dòng ~132, hàm dùng `dto.articleId`/`dto.clusterId`) và trong `publish.controller.ts`/`scheduling.controller.ts` tại endpoint publish/schedule, thêm decorator `@Throttle({ default: { limit: 10, ttl: 60000 } })` (10 request/phút) để giới hạn riêng, chặt hơn mức mặc định.
- **Hướng dẫn cho AI:** Import `ThrottlerModule` vào `apps/api/src/app.module.ts`, thêm vào mảng `imports`. Thêm `ThrottlerGuard` làm `APP_GUARD` toàn cục trong `providers` của `AppModule` (theo tài liệu chính thức của `@nestjs/throttler` cho NestJS v10+). Sau đó áp `@Throttle(...)` vào các endpoint nêu trên.

---

### E. Tối ưu N+1 query khi poll nguồn

#### [MODIFY] `apps/worker/src/processors/source-poll.processor.ts`
- **Vấn đề hiện tại:** Dòng 95-197, với mỗi `entry` trong `entries`, code gọi `this.db.article.findFirst` hai lần riêng biệt (check canonical URL, check hash) bên trong vòng lặp `for` — với nguồn có N bài, tốn tới 2N round-trip DB tuần tự.
- **Giải pháp đề xuất:**
  1. Trước vòng lặp, tính trước toàn bộ `canonical`, `cleanSummary`, `cHash`, `tHash` cho tất cả entries.
  2. Gọi **một lần duy nhất** `this.db.article.findMany({ where: { workspaceId, OR: [{ canonicalUrl: { in: allCanonicals } }, { contentHash: { in: allContentHashes } }, { normalizedTitleHash: { in: allTitleHashes } }] } })` để lấy toàn bộ bài trùng khả dĩ trong một query.
  3. Dựng 3 `Set` (`existingCanonicals`, `existingContentHashes`, `existingTitleHashes`) từ kết quả trên, rồi trong vòng lặp chỉ so sánh trong bộ nhớ (`.has(...)`) thay vì query lại DB.
- **Hướng dẫn cho AI:** Tái cấu trúc hàm `process` trong `SourcePollProcessor`: tách bước "chuẩn hoá dữ liệu" (map toàn bộ `entries` thành mảng object có `canonical/cleanSummary/cHash/tHash`) ra khỏi bước "so khớp trùng lặp" (1 query `findMany` + dựng Set) và bước "insert" (vẫn giữ vòng lặp `for` để tạo từng `article` + enqueue job, vì BullMQ add job vẫn cần từng job riêng). Giữ nguyên toàn bộ logic nghiệp vụ khác (enqueue extraction/clustering, cập nhật health status) không đổi.

---

# 4. Kế hoạch kiểm thử & Xác minh (Verification Plan)

## 4.1 Kiểm thử tự động (chạy sau mỗi bước lớn A → E)

```bash
# Cài đặt lại dependency nếu có package mới (jsonwebtoken, @nestjs/throttler)
pnpm install

# Build toàn bộ monorepo để bắt lỗi type sớm (đặc biệt sau khi đổi guard/import)
pnpm turbo run build

# Chạy toàn bộ unit test hiện có — không được để test nào từ PASS chuyển sang FAIL
pnpm turbo run test

# Chạy riêng các spec liên quan trực tiếp tới auth/facebook/scheduling để soi kỹ
pnpm --filter api test -- ingestion.spec.ts phase3-brand-profiles.spec.ts phase3-quota.spec.ts phase3-verifier.spec.ts phase6.spec.ts
pnpm --filter worker test -- adapters.spec.ts worker.spec.ts
```

## 4.2 Test case mới cần viết (bổ sung, không có trong repo hiện tại)

1. **`auth.guard.spec.ts` (mới, đặt tại `apps/api/src/common/auth.guard.spec.ts`)**
   - Case: Gọi bất kỳ endpoint có `@UseGuards(JwtAuthGuard, ...)` mà không có header `Authorization` → mong đợi HTTP 401.
   - Case: Gửi `Authorization: Bearer <token giả mạo/ký sai secret>` → mong đợi HTTP 401.
   - Case: Gửi token hợp lệ nhưng `workspaceId` trong token khác với `:workspaceId` trên route → mong đợi HTTP 403 (kiểm chứng bước B2/M1 đã hoạt động).
   - Case: `MockAuthGuard` khi `NODE_ENV=production` → mong đợi throw `ForbiddenException` bất kể header gì được gửi.

2. **Test thủ công cho OAuth Facebook (bước B):**
   - Thực hiện luồng connect Facebook (`META_PROVIDER=mock` để không cần app Facebook thật) từ đầu đến cuối trên trình duyệt thật.
   - Mở DevTools → tab Network → xác nhận URL redirect sau callback **không** chứa chuỗi `temp_token=` mà chỉ chứa `session_id=`.
   - Kiểm tra Redis (`redis-cli KEYS "fb:temp_token:*"`) ngay sau khi trang "chọn page" load xong lần đầu → key phải **đã bị xoá** (one-time use).
   - Đợi 11 phút rồi thử gọi lại `available-pages` với `session_id` cũ → mong đợi lỗi `Session expired or invalid`.

3. **Test thủ công cho cách ly tenant Facebook publish (bước C):**
   - Không set `FB_ENV_FALLBACK_WORKSPACE_ID` → tạo publish job cho một workspace chưa connect page nào → mong đợi job chuyển trạng thái `FAILED` với `lastErrorCode: 'FACEBOOK_PAGE_NOT_CONNECTED'`, **không** được tự publish bằng ENV token.
   - Set `FB_ENV_FALLBACK_WORKSPACE_ID=workspace-A` → publish job của `workspace-A` vẫn dùng được ENV fallback; publish job của `workspace-B` (khác ID) vẫn phải fail đúng như trên.

4. **Test rate limiting (bước D):**
   - Gọi endpoint generate draft 11 lần trong 60 giây từ cùng một IP/token → request thứ 11 phải trả về HTTP 429.

5. **Test hiệu năng N+1 (bước E):**
   - Trước và sau khi sửa, log số lượng câu lệnh Prisma query thực thi khi poll một nguồn RSS có 20 entries (dùng `DEBUG=prisma:query` hoặc middleware log query có sẵn). Số query sau khi sửa phải giảm rõ rệt (từ ~40+ query check trùng lặp xuống còn 1 query `findMany`).

## 4.3 Checklist rà soát bảo mật cuối cùng trước khi coi là "xong"

- [ ] `grep -rn "MockAuthGuard" apps/api/src --include="*.ts" | grep -v spec` chỉ còn xuất hiện trong file định nghĩa `auth.guard.ts`, không còn ở bất kỳ controller nghiệp vụ nào.
- [ ] `grep -rn "temp_token" apps/api/src apps/web/src` không còn kết quả nào (đã thay hoàn toàn bằng `session_id`).
- [ ] `grep -rn "x-user-id\|x-user-role\|x-system-role\|x-workspace-id" apps/api/src --include="*.ts"` chỉ còn xuất hiện trong định nghĩa/nhánh dev-only của `MockAuthGuard`, không còn ở logic nghiệp vụ dùng để xác định danh tính thật.
- [ ] `.env.prod.example` có sẵn dòng `NODE_ENV=production`, `JWT_ACCESS_SECRET=`, `JWT_REFRESH_SECRET=` (giá trị để trống, chỉ là placeholder nhắc người vận hành phải điền).
- [ ] `docker compose -f docker-compose.prod.yml config` chạy thử mà **không** set `DB_PASSWORD`/`S3_SECRET_KEY` → phải báo lỗi rõ ràng thay vì chạy được với giá trị mặc định.
- [ ] Toàn bộ `pnpm turbo run build` và `pnpm turbo run test` xanh (pass) sau khi hoàn tất tất cả các bước A→E.

## 4.4 Kế hoạch rollback (git-based, đơn giản)

1. Thực hiện toàn bộ thay đổi trên một nhánh riêng, ví dụ `fix/critical-auth-and-facebook-token`.
2. Commit theo từng Component đã chia ở Mục 3 (một commit cho bước A, một commit riêng cho B, C, D, E) để nếu một bước gây lỗi có thể `git revert <commit>` riêng lẻ mà không ảnh hưởng các bước khác.
3. Trước khi merge vào nhánh chính, đảm bảo checklist 4.3 đã tick đủ và toàn bộ test ở 4.1/4.2 pass.
4. Nếu phát hiện lỗi sau khi merge lên production, rollback nhanh bằng `git revert -m 1 <merge-commit-hash>` rồi deploy lại bản trước đó; **không** rollback bằng cách tắt `JwtAuthGuard` quay lại `MockAuthGuard` trong production dưới bất kỳ hoàn cảnh nào (ForbiddenException ở bước A.3 đã chủ động chặn khả năng này).
