# Database activity dashboards

## Cloudflare — live now

[Pulse production D1 dashboard](https://dash.cloudflare.com/87d75a85659dd39b348acf458b75b606/workers/d1/databases/ebaf7a80-ec0c-430c-a782-bae2cd427cb2/metrics)

This native dashboard is already collecting total/read/write queries, rows read/written, query latency, storage and query insights. Use **Overview** and select a time range. It includes all callers, including the website, digest and administrative queries. Values can arrive with an analytics delay.

## Datadog — live and verified

[Skyline Pulse — Database & Site Activity](https://app.datadoghq.com/dashboard/fe3-pye-rhj) has 12 saved widgets for site traffic, rolling D1 activity, average/p95 query latency, storage, an export heartbeat and guidance links. The dashboard remains private to the organization.

On October 22, 2026, successful Cloudflare collector invocations reported `status:submitted`, and fresh Datadog heartbeat and storage points confirmed delivery using the dashboard's service, environment and database tags. Both secrets are configured; no dashboard import or initial activation step remains.

Existing Cloudflare integration metrics for `zone_name:skylinechurch.tech` cover site requests and response codes, including Access login redirects. These are separate from database query counts. Worker Script collection was enabled but no Worker metrics were found at setup, so no such panels were added.

The organization's MCP policy blocks writes. The dashboard was created using Datadog's normal web editor, and all 12 saved widget definitions were verified through its read-only dashboard API. No organization permissions were changed. `monitoring/datadog-dashboard.json` retains the reference widget definitions for future maintenance.

### Automatic collector

`skyline-pulse-d1-metrics` runs on Cloudflare every five minutes. It uses Cloudflare's aggregate GraphQL Analytics API, then sends up to eight low-cardinality custom metric series to Datadog's US1 Metrics API. It has no D1 binding and cannot read or change church records. It sends no SQL text, parameters, names, notes, recipient addresses, request bodies, logs or traces to Datadog. The website and Monday digest are unchanged.

Collector setup page:

https://dash.cloudflare.com/87d75a85659dd39b348acf458b75b606/workers/services/view/skyline-pulse-d1-metrics/production/settings

The following **Secret** bindings are configured. For a new deployment or credential rotation, enter their values under **Variables and Secrets** and deploy:

| Secret name | Value |
|---|---|
| `CF_ANALYTICS_TOKEN` | Cloudflare API token with **Account → Account Analytics → Read**, restricted to the Peacockengr account |
| `DD_API_KEY` | Datadog **US1 API key** for metrics ingestion; no application key is needed |

Create the Cloudflare token at https://dash.cloudflare.com/profile/api-tokens using a custom token and the specific account restriction. Create the Datadog API key in **Organization Settings → API Keys** (a dedicated `skyline-pulse-d1-metrics` key makes later revocation easy). Enter these directly into Cloudflare. Never paste them into chat or commit them.

The collector exports automatically every five minutes. If either secret is missing, it makes no external calls until both are restored. No local computer, n8n execution or Proxmox resources are needed.

### Read the graphs correctly

- Query and row counts are **rolling 15-minute gauges**, ending five minutes before the current rounded five-minute boundary. Overlap tolerates analytics delays; **never sum successive points** as a daily total. Use the native Cloudflare dashboard for exact selected-period totals.
- Latency is Cloudflare's query-batch response latency in milliseconds. It is not whole-page load time. Empty idle windows omit latency instead of reporting a misleading zero.
- Storage is the maximum observed over the preceding 24 hours, not a claimed current byte count.
- `collector_heartbeat=1` is sent only with a successful export payload. A missing/stale heartbeat or blank graph is not proof of zero database activity.
- Cloudflare analytics errors or Datadog ingestion errors fail the invocation and appear in the collector's Workers logs; they do not fabricate healthy zero values.
- Custom metric ingestion is subject to your Datadog plan. No plan upgrade, log ingestion or paid alert subscription is enabled by this setup. Eight series with fixed database/service/environment tags keep cardinality small.

### Verify activation

The public health endpoint exposes only configuration state and missing secret names:

https://skyline-pulse-d1-metrics.bstef.workers.dev/health

`configured:true` confirms both secret bindings exist; it does **not** prove credential validity or successful delivery. In the collector's Cloudflare logs, confirm `d1_metrics_collection` with `status:submitted`. Then search Datadog Metrics for `skyline.pulse.d1.collector_heartbeat` and verify fresh points. Repeat these checks after changing credentials. Idle windows can omit latency data even when delivery is healthy.

To pause export, set the collector's `METRICS_ENABLED` variable to `false` and deploy. To redeploy from this repository:

```sh
npx wrangler deploy --config monitoring/wrangler.jsonc
```

## Validation performed

Automated tests cover aggregate transformation, correct window boundaries, no network when credentials are missing/disabled, idle-window behavior, upstream permission/schema failures and rejected Datadog submissions. The exact collector GraphQL query was executed successfully against the production database analytics using the connected Cloudflare account. Outbound Datadog submissions are stubbed in tests. Production delivery was separately verified through successful collector logs and fresh Datadog points on October 22, 2026.

References: [Cloudflare D1 analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/), [Datadog Cloudflare integration](https://docs.datadoghq.com/integrations/cloudflare/), [Datadog metrics submission](https://docs.datadoghq.com/api/latest/metrics/#submit-metrics).
