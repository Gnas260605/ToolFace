# System Admin Access

- System-admin capability is separated from workspace role checks.
- Admin routes require `x-system-role=SYSTEM_ADMIN` in the current mock auth model.
- Workspace ownership alone does not unlock system settings, plans, or feature-flag management.
