<div align="center">
  <h1>@cyanheads/onebusaway-mcp-server</h1>
  <p><b>Query stops, routes, real-time arrivals, vehicle positions, and schedules from OneBusAway transit APIs via MCP. STDIO or Streamable HTTP.</b>
  <div>15 Tools • 2 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.15-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/onebusaway-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^2.0.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/onebusaway-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/onebusaway-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^7.0.2-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun->=1.4.0-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/onebusaway-mcp-server/releases/latest/download/onebusaway-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=onebusaway-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvb25lYnVzYXdheS1tY3Atc2VydmVyIl0sImVudiI6eyJPTkVCVVNBV0FZX0FQSV9LRVkiOiJURVNUIn19) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22onebusaway-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Fonebusaway-mcp-server%22%5D%2C%22env%22%3A%7B%22ONEBUSAWAY_API_KEY%22%3A%22TEST%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

**Public Hosted Server:** [https://onebusaway.caseyjhand.com/mcp](https://onebusaway.caseyjhand.com/mcp)

</div>

---

## Overview

Real-time transit data from OneBusAway — stops, routes, arrivals, vehicle positions, and schedules for Puget Sound (King County Metro, Sound Transit, Pierce Transit, Community Transit) and any other OneBusAway-compatible instance. Look up stops and routes, track live arrivals and vehicle positions, and pull full-day schedules and service alerts from any MCP client. Runs as a stdio process, a local Streamable HTTP server, or the public hosted endpoint above.

### Tools

| Tool | Description |
|:---|:---|
| `onebusaway_list_agencies` | List all transit agencies on this OneBusAway instance with IDs, contact info, and geographic coverage |
| `onebusaway_find_stops` | Find bus stops near a lat/lon within a configurable radius, optionally filtered by stop code |
| `onebusaway_search_stops` | Search stops by name or code string to resolve a human-readable name to a stop ID |
| `onebusaway_get_stop` | Fetch details for a specific stop by agency-prefixed ID |
| `onebusaway_find_routes` | Find transit routes near a lat/lon, optionally filtered by name or number |
| `onebusaway_search_routes` | Search routes by name or number to resolve a route short name to a route ID |
| `onebusaway_get_route` | Fetch details for a specific route by agency-prefixed ID |
| `onebusaway_list_routes_for_agency` | List all routes operated by an agency |
| `onebusaway_get_arrivals` | Real-time arrivals and departures at a stop — GPS-tracked predictions, schedule deviation, vehicle positions, and active alerts |
| `onebusaway_get_trip` | Real-time status and full stop sequence for an active trip |
| `onebusaway_get_vehicles` | Real-time positions of all active vehicles for an agency, optionally filtered to one route |
| `onebusaway_get_schedule_for_stop` | Full-day departure schedule for a stop by route and direction |
| `onebusaway_get_schedule_for_route` | Full-day schedule for a route — all trips and stop sequences |
| `onebusaway_get_alert` | Fetch full service alert detail by situation ID — summary, description, reason, affected stops/routes, consequence, and active time windows |
| `onebusaway_get_block` | Fetch the full-day block schedule for a vehicle by block ID — all trips in order with stop times, useful for fleet tracking |

### Resources

| Resource | Description |
|:---|:---|
| `onebusaway://stop/{stopId}` | Stop metadata — name, coordinates, served routes, and wheelchair accessibility |
| `onebusaway://route/{routeId}` | Route metadata — short name, description, agency, and schedule URL |

All resource data is also reachable via `onebusaway_get_stop` and `onebusaway_get_route`. Stop and route IDs use agency-prefixed format: `{agencyId}_{localId}` (e.g. `1_75403`, `1_100259`).

## Capability reference

### `onebusaway_list_agencies` <sub>tool</sub>

- No input parameters — lists every agency on the instance
- Each agency returns ID, contact info, timezone, and geographic coverage center/span
- `limitExceeded` flags an upstream-capped list; this endpoint has no pagination to retrieve the rest
- Agency IDs feed `onebusaway_list_routes_for_agency` and `onebusaway_get_vehicles`

---

### `onebusaway_find_stops` <sub>tool</sub>

- Configurable search radius (default 300m, max ~1600m before results degrade)
- Optional stop code filter (the number printed on the sign, e.g. `75403`)
- Returns stop ID, code, name, direction, served route IDs, and wheelchair boarding status
- `limitExceeded` flag signals when more stops exist beyond the returned set
- Stop IDs returned here feed directly into `onebusaway_get_arrivals`

---

### `onebusaway_search_stops` <sub>tool</sub>

- Free-text query — stop name fragment or stop code; `maxCount` up to 100 (default 10)
- Returns ID, code, name, coordinates, served routes, wheelchair boarding
- `limitExceeded` signals more matches exist than `maxCount` returned
- Stop IDs feed `onebusaway_get_arrivals`

---

### `onebusaway_get_stop` <sub>tool</sub>

- Single `stopId` lookup, agency-prefixed format `{agencyId}_{localId}` (e.g. `1_75403`)
- Returns name, coordinates, direction, served route IDs, and wheelchair boarding status
- Typed `stop_not_found` error recovers via `onebusaway_find_stops` or `onebusaway_search_stops`

---

### `onebusaway_find_routes` <sub>tool</sub>

- Search radius (default 500m, max 1600m) or bounding box via `latSpan` + `lonSpan` (overrides radius when both are set)
- Optional `query` filter by route name or number (e.g. "44")
- Returns short name, long name, agency, GTFS `type` (0=tram … 5=cable_car), brand color, and schedule URL
- `limitExceeded` flag signals more routes exist; narrow the radius or box to see all
- Route IDs feed `onebusaway_get_schedule_for_route` and `onebusaway_get_vehicles`

---

### `onebusaway_search_routes` <sub>tool</sub>

- Free-text query by route name or number; `maxCount` up to 100 (default 10)
- `limitExceeded` signals more matches than `maxCount` returned
- Typed `endpoint_unavailable` error when the instance's search/route endpoint 404s (e.g. Puget Sound) — recovery hints `onebusaway_find_routes` or `onebusaway_list_routes_for_agency` as fallbacks

---

### `onebusaway_get_route` <sub>tool</sub>

- Single `routeId` lookup, agency-prefixed format (e.g. `1_100259`)
- Returns short/long name, agency, GTFS route `type`, brand color, and schedule URL
- Typed `route_not_found` error recovers via `onebusaway_find_routes` or `onebusaway_search_routes`

---

### `onebusaway_list_routes_for_agency` <sub>tool</sub>

- Lists every route operated by one `agencyId` (from `onebusaway_list_agencies`)
- Returns short/long name, GTFS `type`, brand color, and schedule URL per route
- `limitExceeded` flags an upstream-capped list; no pagination to retrieve the rest
- Typed `agency_not_found` error recovers via `onebusaway_list_agencies`

---

### `onebusaway_get_arrivals` <sub>tool</sub>

- Configurable time window (`minutesBefore`, `minutesAfter` — defaults 5/35)
- `predicted` boolean distinguishes GPS-tracked estimates from schedule-only projections; schedule deviation is only meaningful when true
- Schedule deviation in seconds (positive = late, negative = early), vehicle position, and stops-away count when available
- Active service alerts included inline via `situationIds` and `situations[]`
- Typed `rate_limited` error, retryable with `data.retryAfter` — one API key is shared across all callers, so requests queue against a global budget and are only shed when no slot opens within the wait cap
- `tripId` feeds `onebusaway_get_trip`; typed `stop_not_found` recovers via `onebusaway_find_stops`/`onebusaway_search_stops`

---

### `onebusaway_get_trip` <sub>tool</sub>

- `tripId` from an arrivals response; optional `serviceDateMs` for a prior service day (defaults to today)
- `includeSchedule` (default true) toggles the full stop sequence with GTFS arrival/departure times and distance-along-trip
- Journey `phase` (e.g. `in_progress`, `layover_before`, `layover_during`), vehicle position, and schedule deviation
- `blockId` feeds `onebusaway_get_block` for the vehicle's full-day schedule; null when the trip has no block
- Typed `trip_not_found` error recovers via `onebusaway_get_schedule_for_route` when the trip has completed

---

### `onebusaway_get_vehicles` <sub>tool</sub>

- Optional `routeId` filter applied client-side — all agency vehicles are fetched first
- Returns GPS position, heading, schedule deviation, current trip, and journey phase per vehicle
- `predicted` flag distinguishes actively-reporting vehicles from stale entries
- `limitExceeded` flags an upstream-capped list; no pagination to retrieve the rest
- Typed `agency_not_found` error recovers via `onebusaway_list_agencies`

---

### `onebusaway_get_schedule_for_stop` <sub>tool</sub>

- `date` (ISO 8601) defaults to today in the agency's timezone
- Departures grouped by route and direction, each with a `tripId` for follow-up `onebusaway_get_trip` calls
- Static schedule only — no real-time data; use `onebusaway_get_arrivals` for live predictions
- Typed `stop_not_found` error recovers via `onebusaway_find_stops`/`onebusaway_search_stops`

---

### `onebusaway_get_schedule_for_route` <sub>tool</sub>

- `date` (ISO 8601) defaults to today
- Returns every trip for the route with full stop sequences and GTFS arrival/departure times
- Static schedule only — no real-time data; use `onebusaway_get_arrivals` at specific stops for live predictions
- Typed `route_not_found` error recovers via `onebusaway_find_routes`/`onebusaway_search_routes`

---

### `onebusaway_get_alert` <sub>tool</sub>

- Single `situationId` lookup — IDs come from `onebusaway_get_arrivals` (`situations[].id` or `arrivals[].situationIds`)
- `reason` uses TPEG codes (`equipmentReason`, `environmentReason`, `personnelReason`, `miscellaneousReason`, `securityAlert`)
- `affects` scopes the alert to agency/route/stop/trip; `consequences` carries condition and diversion stop IDs
- `activeWindows` gives open-ended or bounded active time ranges
- Typed `situation_not_found` error

---

### `onebusaway_get_block` <sub>tool</sub>

- Single `blockId` lookup — obtain one via `onebusaway_get_arrivals` → `onebusaway_get_trip`
- Returns every trip the vehicle runs that service day, in order, with full stop times
- `activeServiceIds` / `inactiveServiceIds` show which service calendars apply today
- Each trip carries `distanceAlongBlock` and `accumulatedSlackTime` (layover) for fleet-tracking math
- Typed `block_not_found` error

---

### `onebusaway://stop/{stopId}` <sub>resource</sub>

- Stop record as `application/json` — name, coordinates, served routes, wheelchair accessibility
- `stopId` comes from `onebusaway_find_stops` or `onebusaway_search_stops`

---

### `onebusaway://route/{routeId}` <sub>resource</sub>

- Route record as `application/json` — short name, description, agency, schedule URL
- `routeId` comes from `onebusaway_find_routes` or `onebusaway_search_routes`

## Features

Built on [`@cyanheads/mcp-ts-core`](https://github.com/cyanheads/mcp-ts-core): stdio and Streamable HTTP transports, pluggable auth (`none` / `jwt` / `oauth`), swappable storage (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`), structured logging with optional OpenTelemetry tracing.

OneBusAway-specific:

- Wraps [`onebusaway-sdk`](https://www.npmjs.com/package/onebusaway-sdk) with typed error classification (`NotFound`, `RateLimited`, `ServiceUnavailable`)
- Defaults to the Puget Sound instance (`api.pugetsound.onebusaway.org`) — works with `ONEBUSAWAY_API_KEY=TEST` for development
- Configurable `ONEBUSAWAY_BASE_URL` for any OneBusAway-compatible instance (NYC, Washington DC, Tampa, etc.)
- Every upstream request runs through one FIFO pacer sized to the key's budget, so a fan-out burst queues for its slot instead of failing once the budget is spent
- Server-level instructions guide agents through stop ID format, recommended workflows, and OneBusAway's limitations (no trip planning)

Agent-friendly output:

- `predicted` boolean on every arrival and vehicle distinguishes GPS-tracked data from schedule-only projections — agents branch on data, not string parsing
- Schedule deviation in seconds on arrivals, trips, and vehicle positions — structured for countdown timer math
- Cross-tool linkage: `tripId` from arrivals feeds `onebusaway_get_trip`; `stopId` from searches feeds arrivals; `agencyId` from list feeds vehicles and route listing
- Structured error contracts with recovery hints (`onebusaway_search_routes` 404 → fallback to `onebusaway_find_routes` or `onebusaway_list_routes_for_agency`)

## Getting started

### Public Hosted Instance

A public instance is available at `https://onebusaway.caseyjhand.com/mcp` — no installation required. Point any MCP client at it via Streamable HTTP:

```json
{
  "mcpServers": {
    "onebusaway-mcp-server": {
      "type": "streamable-http",
      "url": "https://onebusaway.caseyjhand.com/mcp"
    }
  }
}
```

### Self-Hosted / Local

Add the following to your MCP client configuration file. `ONEBUSAWAY_API_KEY=TEST` works on the Puget Sound instance without registration.

```json
{
  "mcpServers": {
    "onebusaway-mcp-server": {
      "type": "stdio",
      "command": "bunx",
      "args": ["@cyanheads/onebusaway-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "ONEBUSAWAY_API_KEY": "TEST"
      }
    }
  }
}
```

Or with npx (no Bun required):

```json
{
  "mcpServers": {
    "onebusaway-mcp-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cyanheads/onebusaway-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info",
        "ONEBUSAWAY_API_KEY": "TEST"
      }
    }
  }
}
```

Or with Docker:

```json
{
  "mcpServers": {
    "onebusaway-mcp-server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "MCP_TRANSPORT_TYPE=stdio",
        "-e", "ONEBUSAWAY_API_KEY=TEST",
        "ghcr.io/cyanheads/onebusaway-mcp-server:latest"
      ]
    }
  }
}
```

For Streamable HTTP, set the transport and start the server:

```sh
MCP_TRANSPORT_TYPE=http MCP_HTTP_PORT=3010 ONEBUSAWAY_API_KEY=TEST bun run start:http
# Server listens at http://localhost:3010/mcp
```

### Prerequisites

- [Bun v1.4.0](https://bun.sh/) or higher (or Node.js v24+).
- An OneBusAway API key. `TEST` works on the Puget Sound instance for development. For production use or other instances, register at the relevant agency's developer portal.

### Installation

1. **Clone the repository:**

```sh
git clone https://github.com/cyanheads/onebusaway-mcp-server.git
```

2. **Navigate into the directory:**

```sh
cd onebusaway-mcp-server
```

3. **Install dependencies:**

```sh
bun install
```

4. **Configure environment:**

```sh
cp .env.example .env
# edit .env — set ONEBUSAWAY_API_KEY if needed
```

## Configuration

All configuration is validated at startup via Zod schemas. Key environment variables:

| Variable | Description | Default |
|:---|:---|:---|
| `ONEBUSAWAY_API_KEY` | OneBusAway API key. `TEST` works on Puget Sound for development. | `TEST` |
| `ONEBUSAWAY_BASE_URL` | Base URL for the OneBusAway instance. | `https://api.pugetsound.onebusaway.org` |
| `ONEBUSAWAY_RATE_LIMIT_REQUESTS` | Upstream requests the pacer allows per window. | `20` |
| `ONEBUSAWAY_RATE_LIMIT_WINDOW_MS` | Width of the pacer's sliding rate window, in milliseconds. | `60000` |
| `ONEBUSAWAY_RATE_LIMIT_MAX_WAIT_MS` | Longest a call may wait in the pacer queue, in milliseconds. Keep it under the SDK client's 60 s request timeout. | `45000` |
| `MCP_TRANSPORT_TYPE` | Transport: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_PORT` | HTTP server port. | `3010` |
| `MCP_HTTP_ENDPOINT_PATH` | HTTP endpoint path. | `/mcp` |
| `MCP_SESSION_MODE` | Session handling: `auto`, `stateful`, or `stateless`. | `stateless` |
| `MCP_AUTH_MODE` | Auth mode: `none`, `jwt`, or `oauth`. | `none` |
| `MCP_LOG_LEVEL` | Log level (`debug`, `info`, `notice`, `warning`, `error`). | `info` |
| `LOGS_DIR` | Directory for log files (Node.js only). | `<project-root>/logs` |
| `STORAGE_PROVIDER_TYPE` | Storage backend: `in-memory`, `filesystem`, `supabase`, `cloudflare-kv/r2/d1`. | `in-memory` |
| `OTEL_ENABLED` | Enable OpenTelemetry instrumentation. | `false` |

See [`.env.example`](./.env.example) for the full list of optional overrides.

## Running the server

### Local development

- **Build and run the production version:**

  ```sh
  # One-time build
  bun run rebuild

  # Run the built server
  bun run start:http
  # or
  bun run start:stdio
  ```

- **Run checks and tests:**

  ```sh
  bun run devcheck   # Lint, format, typecheck, security, changelog sync
  bun run test       # Vitest test suite
  bun run lint:mcp   # Validate MCP definitions against spec
  ```

### Docker

```sh
docker build -t onebusaway-mcp-server .
docker run --rm -e ONEBUSAWAY_API_KEY=TEST -p 3010:3010 onebusaway-mcp-server
```

The Dockerfile defaults to HTTP transport, stateless session mode, and logs to `/var/log/onebusaway-mcp-server`. OpenTelemetry peer dependencies are installed by default — build with `--build-arg OTEL_ENABLED=false` to omit them.

## Project structure

| Directory | Purpose |
|:---|:---|
| `src/index.ts` | `createApp()` entry point — registers tools/resources and inits the OneBusAway service. |
| `src/config/server-config.ts` | Server-specific env var parsing: `ONEBUSAWAY_API_KEY`, `ONEBUSAWAY_BASE_URL`, and the `ONEBUSAWAY_RATE_LIMIT_*` pacing budget. |
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`). 15 tools across discovery, real-time, and schedule operations. |
| `src/mcp-server/resources` | Resource definitions (`*.resource.ts`). Stop and route metadata resources. |
| `src/services/onebusaway` | OneBusAway service — wraps `onebusaway-sdk`, typed error classification, domain types. |
| `tests/` | Unit and integration tests mirroring `src/`. 350 tests covering all tools, resources, the service, and config. |

## Development guide

See [`CLAUDE.md`](./CLAUDE.md) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources in the `createApp()` arrays in `src/index.ts`
- Wrap external API calls: validate raw → normalize to domain type → return output schema; never fabricate missing fields

## Data

Transit data is sourced from the [Puget Sound OneBusAway API](https://api.pugetsound.onebusaway.org), operated by Sound Transit and King County Metro. Use of this data is governed by the [Sound Transit Transit Data Terms of Use](https://www.soundtransit.org/help-contacts/business-information/open-transit-data-otd/transit-data-terms-use).

Downstream users of this server's hosted endpoint receive data subject to those terms. Key obligations include:

- **Clause 2** — Usage metrics are available on request.
- **Clause 3** — Data is fetched live from the OneBusAway API and is not modified or cached beyond the request cycle.
- **Clause 4** — You agree to pass through substantially similar terms to any users you provide this data to.
- **Clause 7** — This server does not use Sound Transit trademarks in its name or branding.

## Contributing

Issues are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
