# Skill: SaaS Multi-Tenancy, Authentication and Authorization

## Use when

- Implementing users, sessions, workspaces, membership, invitations, roles, permissions
- Adding any workspace-owned resource
- Adding admin access

## Mandatory rules

- `workspace_id` on every tenant-owned row.
- Workspace scope comes from authenticated context and membership.
- Backend default-deny permission checks.
- Argon2id password hashing.
- Email verification.
- Rotating refresh tokens with reuse detection.
- Hashed password-reset and verification tokens.
- Rate limits on authentication endpoints.
- Session revocation.
- Cross-tenant IDOR tests.
- Every membership/role change is audited.
- Owner privileges cannot be silently transferred.

## Required tests

- User from workspace A cannot read/write workspace B.
- Viewer cannot edit.
- Editor cannot manage billing or roles.
- Reviewer can approve but cannot change workspace security.
- Revoked refresh token cannot be reused.
- Reuse detection invalidates token family.
- Suspended workspace cannot publish.
