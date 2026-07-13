# Settings Change and Rollback

- All changes go through the typed registry.
- Updates write to `settings_change_history`.
- Rollback uses the prior stored value and creates a new history entry with source `ROLLBACK`.
