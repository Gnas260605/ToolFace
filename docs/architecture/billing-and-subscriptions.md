# Billing and Subscriptions

Phase 6 introduces `plans`, `plan_versions`, `billing_customers`, `subscriptions`, and `billing_webhook_events`.

- Plans are seeded if missing and remain database driven.
- A workspace without a subscription receives a lazy `FREE_TRIAL` subscription so local flows can proceed in the current repository.
- The mock billing provider creates checkout sessions and uses signed mock webhooks for state transitions.
- Subscription transitions are constrained by a state transition map instead of arbitrary PATCH updates.
- Admin suspension is implemented as a subscription status change to `SUSPENDED`.
