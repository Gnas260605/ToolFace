# Billing Webhook Recovery

- Check `billing_webhook_events` for `FAILED` or `IGNORED`.
- Verify the signature secret and payload hash.
- Re-send the mock event with the same event id to confirm idempotency behavior.
