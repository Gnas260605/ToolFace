# Feature Flags

Feature flags are stored in `feature_flags` with overrides in `feature_flag_overrides`.

- Overrides support `SYSTEM`, `PLAN`, `WORKSPACE`, and `USER` scope.
- Expired overrides are ignored.
- Rollout is deterministic from a stable hash of flag key and workspace/user identity.
- Plan features remain the hard upper bound.
