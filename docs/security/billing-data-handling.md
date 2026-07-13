# Billing Data Handling

- The repository stores no card data.
- Billing webhooks record safe payloads and payload hashes only.
- Provider secrets remain in environment configuration.
- Billing portal and checkout flows are owner-scoped in API permission checks.
