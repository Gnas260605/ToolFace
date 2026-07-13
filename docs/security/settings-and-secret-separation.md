# Settings and Secret Separation

- Normal settings tables are not used to store provider keys, Meta secrets, SMTP credentials, or encryption keys.
- Sensitive settings return masked values only.
- Unknown keys are rejected by the registry.
