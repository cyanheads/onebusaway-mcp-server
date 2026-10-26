<div align="center">
  <h1>@cyanheads/onebusaway-mcp-server</h1>
  <p><b>Query stops, routes, real-time arrivals, vehicle positions, and schedules from OneBusAway transit APIs via MCP. STDIO or Streamable HTTP.</b>
  <div>16 Tools • 2 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.3.0-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/onebusaway-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^2.4.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/onebusaway-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/onebusaway-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^7.0.2-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun->=1.4.0-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/onebusaway-mcp-server/releases/latest/download/onebusaway-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=onebusaway-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvb25lYnVzYXdheS1tY3Atc2VydmVyIl0sImVudiI6eyJPTkVCVVNBV0FZX0FQSV9LRVkiOiJURVNUIn19) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22onebusaway-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Fonebusaway-mcp-server%22%5D%2C%22env%22%3A%7B%22ONEBUSAWAY_API_KEY%22%3A%22TEST%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

<div align="center">

**Public Hosted Server:** [https://onebusaway.caseyjhand.com/mcp](https://onebusaway.caseyjhand.com/mcp)

</div>

---

## Overview

Real-time transit from OneBusAway, set up for Puget Sound (King County Metro, Sound Transit, Pierce Transit, Community Transit, and more) and compatible with any OneBusAway instance. Find stops and routes, track live arrivals and vehicle positions, and pull schedules and service alerts.

### Tools

| Tool | Description |
|:---|:---|
| `onebusaway_list_agencies` | List the transit agencies on the instance, with IDs, contact info, and coverage area |
| `onebusaway_find_stops` | Find stops near a lat/lon, optionally filtered by stop code |
| `onebusaway_search_stops` | Resolve a stop name or code to a stop ID |
| `onebusaway_get_stop` | Fetch one stop by ID |
| `onebusaway_find_routes` | Find routes near a lat/lon, optionally filtered by name or number |
| `onebusaway_search_routes` | Resolve a route name or number to a route ID |
| `onebusaway_get_route` | Fetch one route by ID |
| `onebusaway_list_routes_for_agency` | List every route an agency operates |
| `onebusaway_get_arrivals` | Real-time arrivals and departures at a stop, with schedule deviation, vehicle positions, and active alerts |
| `onebusaway_get_stop_context` | Stop details, real-time arrivals, and full detail for every alert at the stop, from one upstream request |
| `onebusaway_get_alert` | Full service alert detail by situation ID |
| `onebusaway_get_trip` | Real-time status and stop sequence for a trip |
| `onebusaway_get_block` | Every trip one vehicle runs in a service day, in order, with stop times |
| `onebusaway_get_vehicles` | Real-time positions of an agency's active vehicles, optionally for one route |
| `onebusaway_get_schedule_for_stop` | Full-day departure schedule for a stop, by route and direction |
| `onebusaway_get_schedule_for_route` | Full-day schedule for a route: every trip and its stop sequence |

### Resources

| Resource | Description |
|:---|:---|
| `onebusaway://stop/{stopId}` | Stop metadata: name, coordinates, served routes, wheelchair accessibility |
| `onebusaway://route/{routeId}` | Route metadata: short name, description, agency, schedule URL |

The same data is available to tool-only clients through `onebusaway_get_stop` and `onebusaway_get_route`.

## Capability reference

### `onebusaway_list_agencies` <sub>tool</sub>

- No input; returns every agency with `id`, contact info, `timezone`, and `coverageCenter` / `coverageSpan`
- `limitExceeded` flags an upstream-capped list, with no pagination to fetch the rest

---

### `onebusaway_find_stops` <sub>tool</sub>

- `lat` / `lon` required; `radius` in meters, default 300, max 1600; optional `query` matches the stop code printed on the sign
- Each stop carries `id`, `code`, `direction`, `routeIds`, and `wheelchairBoarding` (`ACCESSIBLE` / `NOT_ACCESSIBLE` / `UNKNOWN`); `limitExceeded` means more stops exist within the radius

---

### `onebusaway_search_stops` <sub>tool</sub>

- `query` (stop name fragment or stop code) required; `maxCount` up to 100, default 10
- Same stop shape as `onebusaway_find_stops`; `limitExceeded` means more stops matched than `maxCount`

---

### `onebusaway_get_stop` <sub>tool</sub>

- Single `stopId`; returns `name`, `code`, coordinates, `direction`, `routeIds`, and `wheelchairBoarding`
- Unknown IDs fail as `stop_not_found`, with recovery via `onebusaway_find_stops` or `onebusaway_search_stops`

---

### `onebusaway_find_routes` <sub>tool</sub>

- `lat` / `lon` required; `radius` in meters, default 500, max 1600, or a `latSpan` + `lonSpan` box (both set) in its place; optional `query` by route name or number
- Each route carries `shortName`, `longName`, `agencyId`, GTFS `type` (0=tram … 5=cable_car), `color`, and schedule `url`; `limitExceeded` means more routes exist in the area

---

### `onebusaway_search_routes` <sub>tool</sub>

- `query` (route name or number) required; `maxCount` up to 100, default 10
- Returns `shortName`, `longName`, `agencyId`, and GTFS `type`; `limitExceeded` means more routes matched than `maxCount`
- Fails as `endpoint_unavailable` on instances whose route-search endpoint returns 404, Puget Sound among them; use `onebusaway_find_routes` or `onebusaway_list_routes_for_agency` instead

---

### `onebusaway_get_route` <sub>tool</sub>

- Single `routeId`; returns `shortName`, `longName`, `description`, agency, GTFS `type`, `color`, and schedule `url`
- Unknown IDs fail as `route_not_found`, with recovery via `onebusaway_find_routes` or `onebusaway_search_routes`

---

### `onebusaway_list_routes_for_agency` <sub>tool</sub>

- `agencyId` required; unknown agencies fail as `agency_not_found`
- Every route with `shortName`, `longName`, GTFS `type`, `color`, and `url`; `limitExceeded` flags an upstream-capped list with no pagination

---

### `onebusaway_get_arrivals` <sub>tool</sub>

- `stopId` required; the window is `minutesBefore` (integer 0–60, default 5) / `minutesAfter` (integer 0–240, default 35), with longer horizons left to `onebusaway_get_schedule_for_stop`; unknown stops fail as `stop_not_found`
- Each arrival carries `predicted` (false = schedule-only), `scheduleDeviation` in seconds (positive = late, meaningful only when predicted), `predictedArrivalTime`, `vehiclePosition`, `stopsAway`, and `tripId`
- Active alerts arrive in `situations[]`: those on the stop itself plus those linked from each arrival's `situationIds`, each once

---

### `onebusaway_get_stop_context` <sub>tool</sub>

- Same input as `onebusaway_get_arrivals`, and the same `stop_not_found` / `rate_limited` failures; one call issues one upstream request
- Returns `stop` (the `onebusaway_get_stop` fields minus `routeIds`), `arrivals` in the `onebusaway_get_arrivals` shape, and `alerts` in the `onebusaway_get_alert` shape — every alert on the stop or on an arrival in the window, including stop-wide alerts no arrival in the window carries
- When the upstream response omits the stop, `stop` is null; a referenced alert missing from the response is left out; either way a `notice` names the tool to fetch it with

---

### `onebusaway_get_alert` <sub>tool</sub>

- Single `situationId`, from `onebusaway_get_arrivals` (`situations[].id` or `arrivals[].situationIds`); unknown IDs fail as `situation_not_found`
- Returns a TPEG `reason` code, `severity`, `consequenceMessage`, `affects` (agency, route, stop, or trip scope), `consequences` with diversion stop IDs, and `activeWindows`

---

### `onebusaway_get_trip` <sub>tool</sub>

- `tripId` required; `serviceDateMs` (non-negative integer, midnight local) only for a trip on a previous service day; `includeSchedule` (default true) adds the stop sequence with GTFS times and `distanceAlongTripMeters`
- `status` carries `phase` (e.g. `in_progress`, `layover_before`), `predicted`, `position`, `scheduleDeviation`, and `nextStop`; `blockId` (null when the trip has none) feeds `onebusaway_get_block`
- Fails as `trip_not_found` when the trip isn't active for the service date; a completed trip's times come from `onebusaway_get_schedule_for_route`

---

### `onebusaway_get_block` <sub>tool</sub>

- Single `blockId`, from `onebusaway_get_trip`; unknown IDs fail as `block_not_found`
- Top-level `trips`, `activeServiceIds`, and `inactiveServiceIds` describe the first returned configuration; `alternateConfigurations` preserves every remaining configuration in order. Service IDs are calendar conditions, not a claim that a configuration operates today
- Each trip carries `distanceAlongBlock`, `accumulatedSlackTime` (layover seconds), and `blockStopTimes`. Optional exact `tripId` or `departureFromSec` / `departureBeforeSec` selects complete trips independently in every configuration, retaining empty configuration slots
- With selectors, `selection.total` / `returned` count trip occurrences across configurations; `configurationCounts[0]` describes the top-level configuration, then one entry per alternative

Example: `{"blockId":"<blockId from onebusaway_get_trip>","departureFromSec":86400,"departureBeforeSec":90000}` selects trips with any departure from 24:00 inclusive to 25:00 exclusive, retaining their complete stop sequences.

---

### `onebusaway_get_vehicles` <sub>tool</sub>

- `agencyId` required, unknown agencies fail as `agency_not_found`; optional `routeId` is filtered client-side after all of the agency's vehicles are fetched
- Each vehicle carries `position`, `orientation`, `phase`, `scheduleDeviation`, `tripId`, `nextStop`, and `predicted` (reporting real-time GPS); `limitExceeded` flags an upstream-capped list with no pagination
- `tripId` prefers the active trip; route and headsign metadata resolve only from that trip. `orientation` preserves counter-clockwise degrees from east (0=east, 90=north, 180=west, 270=south), not a compass bearing
- Records missing latitude or longitude are skipped: `omittedWithoutPosition` counts them across the agency, and `omittedWithoutPositionOnRoute` counts resolved matches when filtering by route. These counts are independent of upstream truncation

---

### `onebusaway_get_schedule_for_stop` <sub>tool</sub>

- `stopId` required; optional `date` as a real `YYYY-MM-DD` calendar date, default (omitted or blank) today in the agency's timezone; unknown stops fail as `stop_not_found`
- Departures grouped by route and direction, each with `scheduledDepartureTime` and `tripId`
- `serviceDateMs` preserves the upstream schedule-date marker: query time for an omitted/blank date, instance-local midnight for an explicit date; it is not rounded to a service-day boundary
- Optional `routeId`, `departureFromMs`, and `departureBeforeMs` combine with AND; time bounds are non-negative integer Unix milliseconds, lower inclusive and upper exclusive. Selected results omit empty directions/routes; `selection.total` / `returned` count departure rows before/after selection
- Static schedule only; live predictions come from `onebusaway_get_arrivals`

Example: `{"stopId":"1_75403","routeId":"1_100259","departureFromMs":1792882800000,"departureBeforeMs":1792886400000}` selects that route's departures in the given epoch interval.

---

### `onebusaway_get_schedule_for_route` <sub>tool</sub>

- `routeId` required; optional `date` as a real `YYYY-MM-DD` calendar date, default (omitted or blank) today; unknown routes fail as `route_not_found`
- Every trip that day with `tripId`, `tripHeadsign`, `serviceId`, and its stop sequence
- `serviceDateMs` preserves the upstream route `scheduleDate`, identifying the schedule's service day
- Route, stop, headsign, and service metadata resolve from references first, retaining legacy metadata and grouping fallbacks where reference fields are absent or empty
- Optional exact `tripId` or `departureFromSec` / `departureBeforeSec` selects whole trips having any departure in the interval. Bounds are non-negative integer GTFS seconds from midnight, including values beyond 86400; lower inclusive, upper exclusive. `selection.total` / `returned` count trips before/after selection
- Static schedule only; live predictions come from `onebusaway_get_arrivals` at a stop

Example: `{"routeId":"1_100259","departureFromSec":28800,"departureBeforeSec":32400}` selects trips with any departure from 08:00 inclusive to 09:00 exclusive.

For route and block schedules, a nonblank `tripId` cannot be combined with departure bounds. Blank optional IDs mean omitted; either bound may be omitted, and two supplied bounds must increase. Without selectors, all three tools return their complete mapped response with no selection metadata or default cap. Selection counts describe only that upstream response, not omitted upstream service; a zero match is a successful result with a notice.

Arrivals, stop context, trips, vehicles, schedules, and alerts include a validated IANA `timezone`; epoch clocks and date headings carry that zone explicitly. Stop tools use the queried stop's agency namespace, vehicles the requested agency, and trip/route schedules the referenced route's agency. Each alert resolves its own agency, route, trip, and stop scopes and uses their zone only when every scope resolves and agrees. Missing, invalid, unresolved, or conflicting zones use `UTC`, without additional requests. Epoch numbers and GTFS seconds remain unchanged, including schedule times beyond `24:00`.

---

### `onebusaway://stop/{stopId}` <sub>resource</sub>

- Stop record as `application/json`, the same shape `onebusaway_get_stop` returns
- `stopId` comes from `onebusaway_find_stops` or `onebusaway_search_stops`

---

### `onebusaway://route/{routeId}` <sub>resource</sub>

- Route record as `application/json`, the same shape `onebusaway_get_route` returns
- `routeId` comes from `onebusaway_find_routes` or `onebusaway_search_routes`

## Features

Built on [`@cyanheads/mcp-ts-core`](https://github.com/cyanheads/mcp-ts-core): stdio and Streamable HTTP transports, pluggable auth (`none` / `jwt` / `oauth`), swappable storage (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`), structured logging with optional OpenTelemetry tracing.

OneBusAway-specific:

- Wraps [`onebusaway-sdk`](https://www.npmjs.com/package/onebusaway-sdk) with typed error classification (`NotFound`, `RateLimited`, `ValidationError` for an upstream 400, `ServiceUnavailable`)
- Defaults to the Puget Sound instance (`api.pugetsound.onebusaway.org`), where `ONEBUSAWAY_API_KEY=TEST` works for development; `ONEBUSAWAY_BASE_URL` points it at any other OneBusAway instance
- Stop and route IDs are agency-prefixed, `{agencyId}_{localId}` (stop `1_75403`, route `1_100259`); agency IDs are the bare prefix (`1` for Metro Transit, `40` for Sound Transit)
- One shared pacer, sized by `ONEBUSAWAY_RATE_LIMIT_*`, queues every upstream request against the API key's budget; a call that gets no slot within the wait cap fails as retryable `rate_limited` with `data.retryAfter`, on any tool
- Transit data only, no trip planning; server-level instructions walk agents through the ID format and the common lookup chains

Agent-friendly output:

- `predicted` on every arrival, trip, and vehicle separates GPS-tracked data from schedule-only projections
- Machine-readable times: `scheduleDeviation` in seconds; arrival, stop-schedule, and update timestamps in Unix milliseconds; trip, route-schedule, and block stop times in GTFS seconds from midnight
- Chainable IDs: `stopId` from the stop tools feeds arrivals, `tripId` feeds `onebusaway_get_trip`, `blockId` feeds `onebusaway_get_block`, `situationIds` feed `onebusaway_get_alert`, and `agencyId` feeds vehicles and route listing
- Typed error contracts whose recovery hints name the next tool to call, plus a `notice` on empty or truncated results

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
- A OneBusAway API key. `TEST` works on the Puget Sound instance for development; for production use or other instances, register at the relevant agency's developer portal.

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

| Variable | Description | Default |
|:---|:---|:---|
| `ONEBUSAWAY_API_KEY` | OneBusAway API key. `TEST` works on the Puget Sound instance. | `TEST` |
| `ONEBUSAWAY_BASE_URL` | Base URL of the OneBusAway instance. | `https://api.pugetsound.onebusaway.org` |
| `ONEBUSAWAY_RATE_LIMIT_REQUESTS` | Upstream requests allowed per window, shared by all callers. | `20` |
| `ONEBUSAWAY_RATE_LIMIT_WINDOW_MS` | Width of the sliding rate window, in ms. | `60000` |
| `ONEBUSAWAY_RATE_LIMIT_MAX_WAIT_MS` | Longest a call waits for a slot before failing as `rate_limited`, in ms. Keep it under the SDK's 60 s request timeout. | `45000` |
| `MCP_TRANSPORT_TYPE` | Transport: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_PORT` | HTTP server port. | `3010` |
| `MCP_SESSION_MODE` | HTTP session mode: `stateless`, `stateful`, or `auto`. | `stateless` |
| `MCP_AUTH_MODE` | Authentication: `none`, `jwt`, or `oauth`. | `none` |
| `MCP_LOG_LEVEL` | Log level (`debug`, `info`, `notice`, `warning`, `error`). | `info` |
| `LOGS_DIR` | Directory for log files (Node.js only). | `<project-root>/logs` |
| `STORAGE_PROVIDER_TYPE` | Storage backend: `in-memory`, `filesystem`, `supabase`, `cloudflare-kv/r2/d1`. | `in-memory` |
| `OTEL_ENABLED` | Enable [OpenTelemetry](https://github.com/cyanheads/mcp-ts-core/tree/main/docs/telemetry). | `false` |

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
  bun run devcheck       # Lint, format, typecheck, security, changelog sync
  bun run test           # Vitest test suite
  bun run test:coverage  # Test suite with coverage, held to the framework thresholds
  bun run lint:mcp       # Validate MCP definitions against spec
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
| `src/index.ts` | `createApp()` entry point: registers tools and resources, sets server instructions, inits the OneBusAway service. |
| `src/config` | Server-specific env var parsing and validation with Zod. |
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`) plus the schemas and format helpers they share. |
| `src/mcp-server/resources` | Stop and route resource definitions (`*.resource.ts`). |
| `src/services/onebusaway` | OneBusAway service: wraps `onebusaway-sdk`, paces upstream requests, classifies errors; domain types. |
| `tests/` | Vitest tests for the tools, resources, service, and config. |

## Development guide

See [`CLAUDE.md`](./CLAUDE.md) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources in the `createApp()` arrays in `src/index.ts`
- Wrap external API calls: validate raw → normalize to domain type → return output schema; never fabricate missing fields

## Contributing

Issues are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.

Transit data from the default [Puget Sound OneBusAway API](https://api.pugetsound.onebusaway.org), operated by Sound Transit and King County Metro, is governed by the [Sound Transit Transit Data Terms of Use](https://www.soundtransit.org/help-contacts/business-information/open-transit-data-otd/transit-data-terms-use), and users of the hosted endpoint receive it under those terms. Key obligations:

- **Clause 2**: usage metrics are available on request.
- **Clause 3**: data is fetched live from the OneBusAway API and is not modified or cached beyond the request cycle.
- **Clause 4**: you agree to pass substantially similar terms through to any users you provide this data to.
- **Clause 7**: this server does not use Sound Transit trademarks in its name or branding.
