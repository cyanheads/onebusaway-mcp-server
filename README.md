<div align="center">
  <h1>@cyanheads/onebusaway-mcp-server</h1>
  <p><b>Query stops, routes, real-time arrivals, vehicle positions, and schedules from OneBusAway transit APIs via MCP. STDIO or Streamable HTTP.</b>
  <div>15 Tools • 2 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.9-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/onebusaway-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^1.29.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/onebusaway-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/onebusaway-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^6.0.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun->=1.3.0-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/onebusaway-mcp-server/releases/latest/download/onebusaway-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=onebusaway-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvb25lYnVzYXdheS1tY3Atc2VydmVyIl0sImVudiI6eyJPTkVCVVNBV0FZX0FQSV9LRVkiOiJURVNUIn19) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22onebusaway-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Fonebusaway-mcp-server%22%5D%2C%22env%22%3A%7B%22ONEBUSAWAY_API_KEY%22%3A%22TEST%22%7D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

**Public Hosted Server:** [https://onebusaway.caseyjhand.com/mcp](https://onebusaway.caseyjhand.com/mcp)

</div>

---

## Tools

15 tools covering the full OneBusAway transit data surface — discovery, real-time operations, schedules, alerts, and block schedules:

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

### `onebusaway_find_stops`

Find bus stops near a geographic location.

- Configurable search radius (default 300m, max ~1600m before results degrade)
- Optional stop code filter (the number printed on the sign, e.g. `75403`)
- Returns stop ID, code, name, direction, served route IDs, and wheelchair boarding status
- `limitExceeded` flag signals when more stops exist beyond the returned set
- Stop IDs returned here feed directly into `onebusaway_get_arrivals`

---

### `onebusaway_get_arrivals`

Real-time arrivals and departures at a stop.

- Configurable time window (`minutesBefore`, `minutesAfter` — defaults 5/35)
- `predicted` boolean distinguishes GPS-tracked estimates from schedule-only projections
- Schedule deviation in seconds (positive = late, negative = early)
- Vehicle position and stops-away count when available
- Active service alert summaries included inline
- `tripId` on each arrival feeds `onebusaway_get_trip` for vehicle tracking

---

### `onebusaway_get_trip`

Real-time status and stop sequence for a specific trip.

- Journey phase (`in_progress`, `layover_before`, `layover_during`)
- Vehicle GPS position, heading, and schedule deviation
- Full stop sequence with GTFS arrival/departure times and distance along trip
- Optional `serviceDateMs` for looking up trips from a prior service day

---

### `onebusaway_get_vehicles`

Real-time positions of all active vehicles for an agency.

- Returns GPS coordinates, heading, schedule deviation, and current trip for every active vehicle
- Optional `routeId` filter (applied client-side after fetching all agency vehicles)
- Phase and `predicted` flag distinguish actively-reporting vehicles from stale entries

---

### `onebusaway_search_routes`

Search for routes by name or number across the instance.

- Falls back gracefully: the Puget Sound instance returns 404 on the search endpoint — `onebusaway_find_routes` (lat/lon) or `onebusaway_list_routes_for_agency` are the alternatives
- Error contract surfaces this with structured recovery hints

---

### `onebusaway_get_schedule_for_stop` and `onebusaway_get_schedule_for_route`

Static schedule lookups — full-day timetables without real-time data.

- Date parameter (ISO 8601) defaults to today in the agency's timezone
- `onebusaway_get_schedule_for_stop`: all departures grouped by route and direction, with trip IDs for follow-up calls
- `onebusaway_get_schedule_for_route`: all trips for the route with full stop sequences and GTFS stop times

## Resources

| Type | Name | Description |
|:---|:---|:---|
| Resource | `onebusaway://stop/{stopId}` | Stop metadata — name, coordinates, served routes, and wheelchair accessibility |
| Resource | `onebusaway://route/{routeId}` | Route metadata — short name, description, agency, and schedule URL |

All resource data is also reachable via `onebusaway_get_stop` and `onebusaway_get_route`. Stop and route IDs use agency-prefixed format: `{agencyId}_{localId}` (e.g. `1_75403`, `1_100259`).

## Features

Built on [`@cyanheads/mcp-ts-core`](https://www.npmjs.com/package/@cyanheads/mcp-ts-core):

- Declarative tool and resource definitions — single file per primitive, framework handles registration and validation
- Unified error handling — handlers throw, framework catches, classifies, and formats
- Pluggable auth: `none`, `jwt`, `oauth`
- Swappable storage backends: `in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`
- Structured logging with optional OpenTelemetry tracing
- STDIO and Streamable HTTP transports

OneBusAway-specific:

- Wraps [`onebusaway-sdk`](https://www.npmjs.com/package/onebusaway-sdk) with typed error classification (`NotFound`, `RateLimited`, `ServiceUnavailable`)
- Defaults to the Puget Sound instance (`api.pugetsound.onebusaway.org`) — works with `ONEBUSAWAY_API_KEY=TEST` for development
- Configurable `ONEBUSAWAY_BASE_URL` for any OneBusAway-compatible instance (NYC, Washington DC, Tampa, etc.)
- Server-level instructions guide agents through stop ID format, recommended workflows, and OneBusAway's limitations (no trip planning)

Agent-friendly output:

- `predicted` boolean on every arrival and vehicle distinguishes GPS-tracked data from schedule-only projections — agents branch on data, not string parsing
- Schedule deviation in seconds on arrivals, trips, and vehicle positions — structured for countdown timer math
- Cross-tool linkage: `tripId` from arrivals feeds `onebusaway_get_trip`; `stopId` from searches feeds arrivals; `agencyId` from list feeds vehicles and route listing
- Structured error contracts with recovery hints (`onebusaway_search_routes` 404 → fallback to `onebusaway_find_routes` or `onebusaway_list_routes_for_agency`)

## Getting started

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

- [Bun v1.3.0](https://bun.sh/) or higher (or Node.js v24+).
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
| `MCP_TRANSPORT_TYPE` | Transport: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_PORT` | HTTP server port. | `3010` |
| `MCP_HTTP_ENDPOINT_PATH` | HTTP endpoint path. | `/mcp` |
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
| `src/config/server-config.ts` | Server-specific env var parsing: `ONEBUSAWAY_API_KEY`, `ONEBUSAWAY_BASE_URL`. |
| `src/mcp-server/tools` | Tool definitions (`*.tool.ts`). 13 tools across discovery, real-time, and schedule operations. |
| `src/mcp-server/resources` | Resource definitions (`*.resource.ts`). Stop and route metadata resources. |
| `src/services/onebusaway` | OneBusAway service — wraps `onebusaway-sdk`, typed error classification, domain types. |
| `tests/` | Unit and integration tests mirroring `src/`. 77 tests covering all tools and resources. |

## Development guide

See [`CLAUDE.md`](./CLAUDE.md) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources in the `createApp()` arrays in `src/index.ts`
- Wrap external API calls: validate raw → normalize to domain type → return output schema; never fabricate missing fields

## Contributing

Issues and pull requests are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

## Data

Transit data is sourced from the [Puget Sound OneBusAway API](https://api.pugetsound.onebusaway.org), operated by Sound Transit and King County Metro. Use of this data is governed by the [Sound Transit Transit Data Terms of Use](https://www.soundtransit.org/help-contacts/business-information/open-transit-data-otd/transit-data-terms-use).

Downstream users of this server's hosted endpoint receive data subject to those terms. Key obligations include:

- **Clause 2** — Usage metrics are available on request.
- **Clause 3** — Data is fetched live from the OneBusAway API and is not modified or cached beyond the request cycle.
- **Clause 4** — You agree to pass through substantially similar terms to any users you provide this data to.
- **Clause 7** — This server does not use Sound Transit trademarks in its name or branding.

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
