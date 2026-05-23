# onebusaway-mcp-server — Idea

MCP server wrapping the OneBusAway API — open-source real-time transit data platform used by multiple US transit agencies. Primary instance: Puget Sound (King County Metro, Sound Transit, Pierce Transit, Community Transit, Kitsap Transit, WA State Ferries, etc.).

## Why

- Real-time transit arrivals, routes, stops, vehicle positions, service alerts
- Multi-city: separate API instances for Seattle/Puget Sound, NYC MTA, Tampa, San Diego, others
- Free access (key=TEST works on Puget Sound instance)
- Official TypeScript SDK (`onebusaway-sdk` on npm, Stainless-generated, maintained)
- No existing MCP server for transit data

## API

- **Base URL (Puget Sound)**: `https://api.pugetsound.onebusaway.org/api/where/`
- **Auth**: Query param `?key=API_KEY` (key=TEST works for dev on Puget Sound)
- **Format**: JSON (XML also supported)
- **Key endpoints**:
  - `agencies-with-coverage` — list transit agencies
  - `stops-for-location` — find stops near coordinates
  - `arrivals-and-departures-for-stop` — real-time arrivals
  - `routes-for-agency` — list routes
  - `trip-details` — trip info with shape/stops
  - `vehicles-for-agency` — real-time vehicle positions
  - `schedule-for-stop` / `schedule-for-route` — timetables
- **Rate limits**: Not publicly documented; HTTP 429 enforced
- **Multi-city**: Each city has a separate base URL; SDK supports `baseURL` override

## Scope

- Read-only (transit data queries)
- Multi-instance: configurable base URL per transit agency
- Real-time arrivals, route/stop discovery, vehicle tracking, schedules
- No trip planning (OBA redirects to OpenTripPlanner for that)

## Licensing

- Software: Apache 2.0 (open source)
- No published ToS for hosted API endpoints — per-instance operator controls access
- No explicit prohibition on proxying found, but also no explicit permission
- Safest path: use key=TEST for dev, document that production use should coordinate with instance operator

## SDK

- `onebusaway-sdk` (npm) — TypeScript, ESM, full type coverage, Stainless-generated
