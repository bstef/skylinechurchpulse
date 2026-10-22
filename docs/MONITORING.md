# Database activity dashboards

## Cloudflare — live now

[Pulse production D1 dashboard](https://dash.cloudflare.com/87d75a85659dd39b348acf458b75b606/workers/d1/databases/ebaf7a80-ec0c-430c-a782-bae2cd427cb2/metrics)

This native dashboard is already collecting total/read/write queries, rows read/written, query latency, storage and query insights. Use **Overview** and select a time range. It includes all callers, including the website, digest and administrative queries. Values can arrive with an analytics delay.

## Datadog — activation needs two secrets and dashboard import

Existing Datadog Cloudflare integration metrics are verified for `zone_name:skylinechurch.tech`. They cover site requests and response codes, including Access login redirects. They are not database query counts. The integration has Worker Script collection enabled but no Worker metrics were found at setup; this dashboard does not invent them.

`monitoring/datadog-dashboard.json` is an ordered 12-widget dashboard for US1 (`app.datadoghq.com`). It includes site traffic, rolling D1 activity, average/p95 query latency, storage and an export heartbeat. The Datadog connection's organization policy blocks MCP writes, including its widget validator, so it could not create or validate the dashboard remotely. The JSON was prepared from Datadog's widget guidance; Datadog's import UI must validate it before saving.

Import it through Datadog **Dashboards → New Dashboard** and the dashboard's **Import dashboard JSON** action. If the menu differs, search Datadog's dashboard controls for JSON import. The dashboard must remain private to your organization; there is no public sharing requirement.

### Automatic collector

`skyline-pulse-d1-metrics` runs on Cloudflare every five minutes. It uses Cloudflare's aggregate GraphQL Analytics API, then sends up to eight low-cardinality custom metric series to Datadog's US1 Metrics API. It has no D1 binding and cannot read or change church records. It sends no SQL text, parameters, names, notes, recipient addresses, request bodies, logs or traces to Datadog. The website and Monday digest are unchanged.

Collector setup page:

https://dash.cloudflare.com/87d75a85659dd39b348acf458b75b606/workers/services/view/skyline-pulse-d1-metrics/production/settings

Under **Variables and Secrets**, add these as **Secret**, then deploy the changes:

| Secret name | Value |
|---|---|
| `CF_ANALYTICS_TOKEN` | Cloudflare API token with **Account → Account Analytics → Read**, restricted to the Peacockengr account |
| `DD_API_KEY` | Datadog **US1 API key** for metrics ingestion; no application key is needed |

Create the Cloudflare token at https://dash.cloudflare.com/profile/api-tokens using a custom token and the specific account restriction. Create the Datadog API key in **Organization Settings → API Keys** (a dedicated `skyline-pulse-d1-metrics` key makes later revocation easy). Enter these directly into Cloudflare. Never paste them into chat or commit them.

The collector is deployed but makes no external calls while either secret is missing. Once both are set, the next five-minute trigger starts exporting automatically. No local computer, n8n execution or Proxmox resources are needed.

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

`configured:true` confirms both secret bindings exist; it does **not** prove credential validity or successful delivery. In the collector's Cloudflare logs, confirm `d1_metrics_collection` with `status:submitted`. Then search Datadog Metrics for `skyline.pulse.d1.collector_heartbeat` and verify fresh points. Initial D1 charts remain blank until credentials are configured and Datadog accepts data. No working ingestion has been claimed before this check.

To pause export, set the collector's `METRICS_ENABLED` variable to `false` and deploy. To redeploy from this repository:

```sh
npx wrangler deploy --config monitoring/wrangler.jsonc
```

## Validation performed

Fifteen tests pass, including aggregate transformation, correct window boundaries, no network when credentials are missing/disabled, idle-window behavior, upstream permission/schema failures and rejected Datadog submissions. The exact collector GraphQL query was executed successfully against the production database analytics using the connected Cloudflare account. Outbound Datadog submissions were stubbed in tests; no real ingestion API key is configured yet.

References: [Cloudflare D1 analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/), [Datadog Cloudflare integration](https://docs.datadoghq.com/integrations/cloudflare/), [Datadog metrics submission](https://docs.datadoghq.com/api/latest/metrics/#submit-metrics).
