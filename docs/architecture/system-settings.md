# System Settings

The settings model is registry-driven.

- Every key has a schema, default, scope, and UI category.
- Unknown keys are rejected.
- System settings establish the baseline.
- Workspace settings can only override keys explicitly marked as overridable.
- Sensitive values are masked.
- History is append-only in `settings_change_history`.
- Rollback replays the previous value as a new change.
