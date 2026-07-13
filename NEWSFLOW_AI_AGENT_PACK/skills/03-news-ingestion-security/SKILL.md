# Skill: News Ingestion and Untrusted Content Security

## Use when

- Adding RSS/Atom sources
- Fetching URLs
- Parsing XML
- Extracting article pages
- Normalizing articles
- Detecting duplicates

## Mandatory rules

- Approved sources only.
- HTTPS by default.
- DNS resolution and private/reserved IP blocking.
- Revalidate every redirect destination.
- Block localhost, metadata endpoints, link-local, multicast, private networks.
- Limit redirects, response bytes, feed entries, and time.
- Use conditional GET where possible.
- No JavaScript execution.
- No login/paywall/anti-bot bypass.
- Sanitize HTML.
- Disable XML external entity behavior and test malicious XML.
- Persist excerpts only unless rights permit more.
- Canonical URL, hash, title similarity, and cluster-based duplicate handling.
- Treat updates as story cluster updates, not duplicates to discard blindly.

## Required tests

- Private IP URL blocked.
- Public URL redirecting to private IP blocked.
- Oversized feed rejected.
- Malicious XML does not resolve entities.
- Stored XSS is sanitized.
- Same canonical article is inserted once.
