# Meta App Review Submission Guidelines

To transition your Meta Developer Application to **Live Mode**, you must complete the App Review process. This document provides step-by-step guidelines to prepare your submission.

---

## 1. Required Permissions

Only request the scopes necessary for the application to function:

| Scope | Purpose |
| --- | --- |
| `pages_show_list` | Allows the user to select which Facebook Pages to connect to ToolFace. |
| `pages_manage_posts` | Allows the application to publish, edit, and delete posts on behalf of the Page. |
| `pages_read_engagement` | Allows the application to read posts and analyze engagement statistics. |

---

## 2. OAuth Redirect URIs

Ensure your Meta Developer Console is configured with the correct redirect URI.

- **Developer URL**: `https://14.225.204.44`
- **Valid OAuth Redirect URI**: `https://14.225.204.44/api/v1/integrations/facebook/callback`

---

## 3. Screencast Video Guidelines

Meta reviewers require a screencast showing how the permissions are used:

1. **Start at Login**: Show logging in to ToolFace.
2. **Facebook Connect Flow**:
   - Click the "Kênh Facebook" link.
   - Click "Kết nối Facebook".
   - Complete the Meta OAuth popup window (demonstrating `pages_show_list` and page selection).
3. **Publishing a Post**:
   - Navigate to "Bản nháp" (Drafts).
   - Edit a draft or write original content.
   - Click "Phê duyệt" (Approve) or "Đăng ngay" (Publish now) to trigger page publishing (demonstrating `pages_manage_posts`).
4. **Verification**:
   - Navigate to the connected test Facebook Page.
   - Show the published post appearing on the timeline.

---

## 4. Test Credentials

Provide the Meta reviewer with test accounts:
- Add a Meta Test User inside the **Roles** tab of your Meta Developer console.
- Provide the credentials of this Test User so the reviewer can complete the OAuth flow using an account that owns a test Page.
