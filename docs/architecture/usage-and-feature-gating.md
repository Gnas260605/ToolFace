# Usage and Feature Gating

Phase 6 adds:

- `usage_counters` for period-scoped used and reserved quantities
- `usage_reservations` for atomic reservation / consume / release flows
- `feature_flags` and `feature_flag_overrides`

Backend gates now run before:

- creating sources
- creating brand profiles
- connecting Facebook pages
- generating drafts
- publishing
- scheduling

Plan features are checked before feature flags so a flag cannot grant access beyond the current plan.
