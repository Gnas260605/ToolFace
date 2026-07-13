# Billing Provider Configuration

- `BILLING_PROVIDER=mock` is the default for local development and CI.
- `BILLING_WEBHOOK_SECRET` signs mock webhook payloads.
- Production adapters must keep provider secrets server-side and use HTTPS redirect URLs.
