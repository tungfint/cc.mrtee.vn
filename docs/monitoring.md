# Monitoring and alert thresholds

The API exposes Prometheus text metrics at `GET /api/metrics`. Send
`Authorization: Bearer <METRICS_TOKEN>`; the endpoint is intentionally denied
when the token is absent. Application logs are structured JSON inside the Nest
log message and include request ID, method, path, status, latency, and client IP.

Recommended pilot alerts:

| Signal                                 | Warning                      | Critical                     |
| -------------------------------------- | ---------------------------- | ---------------------------- |
| `/api/health/ready`                    | 2 failures in 2 minutes      | 5 failures in 5 minutes      |
| `cc_sync_queue_jobs{state="failed"}`   | greater than 0 for 5 minutes | increasing for 15 minutes    |
| `cc_sync_queue_oldest_waiting_seconds` | greater than 300 seconds     | greater than 900 seconds     |
| `cc_wallet_reconciliation_mismatch`    | any non-zero value           | non-zero for 5 minutes       |
| API 5xx rate from logs/proxy           | over 1% for 5 minutes        | over 5% for 5 minutes        |
| API p95 latency from logs/proxy        | over 1 second for 10 minutes | over 3 seconds for 5 minutes |
| PostgreSQL/Redis container health      | unhealthy once               | unhealthy for 2 minutes      |
| Disk usage                             | over 75%                     | over 90%                     |

Route Caddy and container logs to the host's log collector and configure
rotation; local container logs are not a durable audit store. Keep metrics on a
private monitoring network or firewall it to the collector even though bearer
authentication is required.

The smoke load command is intentionally small and safe for staging:

```bash
npm run load:smoke
LOAD_REQUESTS=1000 LOAD_CONCURRENCY=50 npm run load:smoke
```

Do not point the smoke script at production without an approved test window.
