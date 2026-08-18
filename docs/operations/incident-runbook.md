# Incident Response Runbook

This document is the standard operational procedure (SOP) for diagnosing and resolving production incidents in the ToolFace (NewsFlow AI) platform.

---

## 1. Triage Process

When an alert is triggered (or an issue is reported), follow these steps:

1. **Verify Availability**:
   Check if the system health endpoints return 200 OK:
   ```bash
   curl -i https://14.225.204.44/api/v1/health/ready
   ```
2. **Access Server Logs**:
   Inspect Nginx access and error logs:
   ```bash
   tail -n 100 /root/ToolFaceAI/infrastructure/nginx/logs/error.log
   ```
3. **Check Container Status**:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

---

## 2. Common Scenarios & Recovery

### Scenario A: Database is Down / Unreachable (`P1001`)

- **Symptoms**: Health check endpoint returns 503 Service Unavailable, API log shows `P1001` or connection refused.
- **Recovery Steps**:
  1. Check if the database container is running:
     ```bash
     docker ps -f name=newsflow-postgres-prod
     ```
  2. If stopped, restart it:
     ```bash
     docker compose -f docker-compose.prod.yml start postgres
     ```
  3. If failing to start, inspect container logs:
     ```bash
     docker logs newsflow-postgres-prod
     ```
  4. Ensure VPS disk space is not full:
     ```bash
     df -h
     ```

### Scenario B: Redis Queue / BullMQ Job Blockage

- **Symptoms**: Publications stay in `PUBLISHING` status indefinitely, notification emails are not sent.
- **Recovery Steps**:
  1. Restart the background worker container:
     ```bash
     docker compose -f docker-compose.prod.yml restart worker
     ```
  2. Flush failed/stuck Redis jobs if corrupted:
     ```bash
     docker exec -it newsflow-redis-prod redis-cli flushall
     ```
     *(Note: This clears active queues; use caution. Clean queue stats first).*

### Scenario C: RSS Poll / Facebook Publish Failure

- **Symptoms**: Feed health shows `FAILING`, or Facebook publish history shows errors.
- **Recovery Steps**:
  1. For RSS Feeds: Verify if the source URL is reachable from the server:
     ```bash
     curl -I <feedUrl>
     ```
  2. For Facebook: Check the log of the `facebook-publish` worker to inspect the Graph API error message. If it reports expired token, prompt the user to re-authenticate or update the environment token overrides.
