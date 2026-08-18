# Security and Performance Review

This document summarizes the security mechanisms, vulnerability mitigations, and performance controls implemented in the ToolFace (NewsFlow AI) platform.

---

## 1. Sensitive Data Encryption

- **Facebook Access Tokens**: Page access tokens are stored in the database in encrypted format.
- **Algorithm**: Symmetric **AES-256-GCM** encryption is applied.
- **Key Versioning**: Supported via the `TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION` and keys specified in `.env`.
- **Decryption**: Tokens are only decrypted in-memory inside the Worker process right before invoking the Facebook Graph API publishing call.

---

## 2. SSRF (Server-Side Request Forgery) Protection

To prevent attackers from using the RSS source fetcher to scan the internal corporate network:
- **Private IP Blocking**: The source polling fetcher checks parsed IP addresses of the target domain name. It rejects all loopback, private RFC1918 (e.g., `10.0.0.0/8`, `192.168.0.0/16`), link-local, and multicast addresses.
- **Max Bytes Limit**: Restricts feed downloads to a maximum of 5MB to prevent memory exhaustion / Denial of Service (DoS) attacks via infinite streams.

---

## 3. Rate Limiting and Abuse Prevention

- **API Rate Limiting**: Managed via NestJS Throttler. Restricts API endpoint consumption based on client IP addresses.
- **Queue Limits**: BullMQ rate-limits job ingestion to prevent worker overloading during major news breaks.

---

## 4. Log Redaction and Secrets Handling

- **Redaction**: Logger middleware intercepts incoming headers and request bodies, stripping out Authorization tokens, passwords, and Meta app secrets before logging to console or write files.
- **Secrets Management**: Configuration uses standard environment variable injection (`dotenv` format). Production secrets are maintained in a dedicated `.env.prod` file which is excluded from git source control.
