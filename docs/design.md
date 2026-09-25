# onebusaway-mcp-server — Design

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `onebusaway_get_arrivals` | Real-time arrivals and departures at a stop. Returns predicted and scheduled times, vehicle positions, schedule deviation, and any active service alerts. | `stopId`, `minutesBefore?` (0–60), `minutesAfter?` (0–240) | `readOnlyHint: true` |
| `onebusaway_get_stop_context` | Stop details, real-time arrivals, and full detail for every service alert at the stop, from one upstream request. | `stopId`, `minutesBefore?` (0–60), `minutesAfter?` (0–240) | `readOnlyHint: true` |
| `onebusaway_get_alert` | Full detail for one service alert (situation) by ID. | `situationId` | `readOnlyHint: true` |
| `onebusaway_get_block` | Every trip one vehicle runs in a service day, in order, with stop times. | `blockId` | `readOnlyHint: true` |
| `onebusaway_find_stops` | Find bus stops near a location or by stop code. Returns stop IDs, names, served routes, and wheelchair accessibility. | `lat`, `lon`, `radius?`, `query?` | `readOnlyHint: true` |
| `onebusaway_find_routes` | Find transit routes near a location or search by name. Returns route IDs, short names, descriptions, and agency. | `lat`, `lon`, `radius?`, `latSpan?`, `lonSpan?`, `query?` | `readOnlyHint: true` |
| `onebusaway_get_stop` | Fetch details for a specific stop by ID. Returns name, coordinates, served routes, and wheelchair accessibility. | `stopId` | `readOnlyHint: true` |
| `onebusaway_get_route` | Fetch details for a specific route by ID, including schedule URL and route color. | `routeId` | `readOnlyHint: true` |
| `onebusaway_get_schedule_for_stop` | Full day schedule for a stop — all departures by route and direction. | `stopId`, `date?` (`YYYY-MM-DD`) | `readOnlyHint: true` |
| `onebusaway_get_schedule_for_route` | Full day schedule for a route — all trips and stop sequences. | `routeId`, `date?` (`YYYY-MM-DD`) | `readOnlyHint: true` |
| `onebusaway_get_trip` | Real-time status and stop sequence for an active trip. Returns vehicle position, schedule deviation, and stops remaining. | `tripId`, `serviceDateMs?`, `includeSchedule?` | `readOnlyHint: true` |
| `onebusaway_get_vehicles` | Real-time vehicle positions for all active vehicles for an agency, optionally filtered to one route (client-side). | `agencyId`, `routeId?` | `readOnlyHint: true` |
| `onebusaway_list_agencies` | List all transit agencies served by this OneBusAway instance, with agency IDs needed for other calls. | (none) | `readOnlyHint: true`, `openWorldHint: false` |
| `onebusaway_list_routes_for_agency` | List all routes operated by an agency. | `agencyId` | `readOnlyHint: true`, `openWorldHint: false` |
| `onebusaway_search_stops` | Search for stops by name or code string. Useful for resolving a stop name to an ID. | `query`, `maxCount?` | `readOnlyHint: true` |
| `onebusaway_search_routes` | Search for routes by name or number. Useful for resolving a route short name (e.g. "44") to a route ID. | `query`, `maxCount?` | `readOnlyHint: true` |

### Resources

| URI Template | Description | Pagination |
|:-------------|:------------|:-----------|
| `onebusaway://stop/{stopId}` | Stop metadata — name, coordinates, served routes, accessibility. | No |
| `onebusaway://route/{routeId}` | Route metadata — short name, description, agency, schedule URL. | No |

### Prompts

None. The domain is operational data queries — no recurring analysis framework or structured interaction template earns a prompt here.

---

## Overview

MCP server wrapping the [OneBusAway REST API](https://developer.onebusaway.org/api/where) — the open-source real-time transit data platform used by multiple US transit agencies. Primary instance is Puget Sound (King County Metro, Sound Transit, Pierce Transit, Community Transit, Kitsap Transit, Washington State Ferries, and others). Other instances include NYC MTA, Tampa, San Diego.

The server provides real-time arrivals, vehicle tracking, route/stop discovery, and schedule lookup. It is read-only — trip planning is out of scope (OneBusAway defers to OpenTripPlanner for routing).

**Target users:** agents helping riders ("when's the next bus?", "where is the 44 right now?", "what stops are near Pike Place Market?") and agents building transit-aware workflows (schedule analysis, delay monitoring, route research).

---

## Requirements

- Read-only access to transit data: agencies, routes, stops, arrivals, vehicles, schedules, trip status
- Multi-instance: configurable `ONEBUSAWAY_BASE_URL` (default: Puget Sound) and `ONEBUSAWAY_API_KEY` (default: `TEST`)
- Real-time predictions: arrivals return both scheduled and predicted times with schedule deviation in seconds
- Service alert passthrough: arrivals and trip status responses include active situation IDs and summaries when present
- No trip planning — direct users to transitapp.com, Google Maps, or OpenTripPlanner
- Rate limits: the Puget Sound instance rate-limits at ~20 req/min from a single IP; service should surface 429 with a retry hint

---

## Services

| Service | Wraps | Used By |
|:--------|:------|:--------|
| `OneBusAwayService` | `onebusaway-sdk` npm client | All tools |

Single service, single SDK client. Initialized once at startup with `baseURL` and `apiKey` from env config, and `maxRetries: 0` to disable the SDK's built-in retry — one tool call issues one upstream request. A process-wide pacer (`ONEBUSAWAY_RATE_LIMIT_*`) queues every upstream request against the shared API key's budget and fails a call that gets no slot as retryable `rate_limited`. All tool handlers call through the service — no direct HTTP in handlers.

---

## Config

| Env Var | Required | Description |
|:--------|:---------|:------------|
| `ONEBUSAWAY_API_KEY` | No (defaults to `TEST`) | API key for the OneBusAway instance. `TEST` works on Puget Sound for development. |
| `ONEBUSAWAY_BASE_URL` | No (defaults to Puget Sound) | Base URL of the OneBusAway instance. Override to target NYC (`https://bustime.mta.info`), Tampa (`https://api.tampa.onebusaway.org`), or a self-hosted instance. |
| `ONEBUSAWAY_RATE_LIMIT_REQUESTS` | No (defaults to `20`) | Upstream requests allowed per window, shared by all callers. |
| `ONEBUSAWAY_RATE_LIMIT_WINDOW_MS` | No (defaults to `60000`) | Width of the sliding rate window, in ms. |
| `ONEBUSAWAY_RATE_LIMIT_MAX_WAIT_MS` | No (defaults to `45000`) | Longest a call waits for a slot before failing as `rate_limited`, in ms. |

---

## Domain Mapping

| Noun | Operations | API Endpoint(s) |
|:-----|:-----------|:----------------|
| Agency | list, get | `agencies-with-coverage`, `agency/{id}` |
| Stop | find (by location), find (by code), get, list-for-agency, list-for-route, search | `stops-for-location`, `stop/{id}`, `stops-for-agency/{id}`, `stops-for-route/{id}`, `search/stop` |
| Route | find (by location), get, list-for-agency, search | `routes-for-location`, `route/{id}`, `routes-for-agency/{id}`, `search/route` |
| Arrival/Departure | list (for stop), get (single) | `arrivals-and-departures-for-stop/{id}`, `arrival-and-departure-for-stop/{id}` |
| Trip | get details, get for vehicle | `trip-details/{id}`, `trip-for-vehicle/{id}`, `trips-for-route/{id}` |
| Vehicle | list (for agency) | `vehicles-for-agency/{id}` |
| Schedule | get for stop, get for route | `schedule-for-stop/{id}`, `schedule-for-route/{id}` |

Not every operation becomes a tool. Operations used only for resolution (e.g., `stop-ids-for-agency`, `route-ids-for-agency`) are omitted — they're implementation details of the service layer, not agent-facing operations.

---

## Implementation Order

1. `OneBusAwayService` — SDK client init, all API calls, typed response shapes
2. Config (`server-config.ts`) — `ONEBUSAWAY_API_KEY`, `ONEBUSAWAY_BASE_URL`
3. Discovery tools: `onebusaway_list_agencies`, `onebusaway_find_stops`, `onebusaway_find_routes`
4. Search tools: `onebusaway_search_stops`, `onebusaway_search_routes`
5. Entity fetch tools: `onebusaway_get_stop`, `onebusaway_get_route`
6. Real-time tools: `onebusaway_get_arrivals`, `onebusaway_get_trip`, `onebusaway_get_vehicles`
7. Schedule tools: `onebusaway_get_schedule_for_stop`, `onebusaway_get_schedule_for_route`
8. Agency tools: `onebusaway_list_routes_for_agency`
9. Resources: `onebusaway://stop/{stopId}`, `onebusaway://route/{routeId}`

Each step is independently testable.

---

## Tool Specifications

### `onebusaway_get_arrivals`

The primary real-time tool — the most common agent query.

**Description:** Real-time arrivals and departures at a stop. Returns predicted arrival times, schedule deviation (how many seconds late/early), vehicle positions, and any active service alerts affecting the stop. Predicted times are available for vehicles with GPS tracking; falls back to scheduled times when a vehicle isn't tracked.

**Input schema:**
```
stopId: string — Stop ID in agency-prefixed format (e.g. "1_75403" for Metro Transit stop 75403, "40_100239" for Sound Transit).
minutesBefore: integer 0–60 (default 5) — Include arrivals that departed up to this many minutes ago.
minutesAfter: integer 0–240 (default 35) — Include arrivals expected within the next N minutes. Longer horizons belong to onebusaway_get_schedule_for_stop.
```

Both bounds are enforced at the schema: OneBusAway binds the two values to a 32-bit int without validation, so negatives shift the window and large values overflow. An empty window's `notice` suggests raising `minutesAfter` only while it is below 240.

**Output schema:**
```
stopId: string
stopName: string
currentTime: number — Server time as Unix milliseconds, for computing countdown timers.
arrivals: Array of:
  routeShortName: string
  tripHeadsign: string
  predicted: boolean — true if GPS-tracked; false if schedule-only.
  predictedArrivalTime: number | null — Unix ms; null if unpredicted.
  scheduledArrivalTime: number — Unix ms.
  scheduleDeviation: number — Seconds late (positive) or early (negative). Only meaningful when predicted=true.
  vehicleId: string | null
  vehiclePosition: { lat: number, lon: number } | null
  stopsAway: number | null — Number of stops until this stop.
  tripId: string — For follow-up onebusaway_get_trip calls.
  routeId: string — For follow-up route calls.
  situationIds: string[]
situations: Array of: — Active service alerts on the stop itself and those referenced by arrivals, each once.
  id: string
  summary: string
  description: string | null
```

**Error contract:**
```
{ reason: 'stop_not_found', code: NotFound, when: 'Stop ID does not exist on this instance', recovery: 'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.' }
{ reason: 'rate_limited', code: RateLimited, retryable: true, when: 'No upstream request slot opened within the queue wait cap, or OneBusAway returned a rate limit response', recovery: 'Wait the seconds given in data.retryAfter, then retry.' }
```

An upstream HTTP 400 on any tool surfaces as a non-retryable `ValidationError` carrying OneBusAway's field errors.

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_stop_context`

**Description:** Everything happening at a stop in one call: the stop's details, its real-time arrivals, and full detail for every service alert on the stop or on any arrival in the window — what `onebusaway_get_stop`, `onebusaway_get_arrivals`, and one `onebusaway_get_alert` per alert would return, from a single `arrivals-and-departures-for-stop` request.

**Input schema:** identical to `onebusaway_get_arrivals` (`stopId`, `minutesBefore`, `minutesAfter`).

**Output schema:**
```
stop: { id, code, name, lat, lon, direction, wheelchairBoarding } | null — The onebusaway_get_stop fields minus routeIds (the references copy lists only routes in this response). Null when the response omits the stop.
currentTime: number — Server time as Unix milliseconds.
arrivals: Array — Same shape as onebusaway_get_arrivals.
alerts: Array — Same shape as onebusaway_get_alert; the union of stop-level and arrival-level situation IDs, each once.
```

A referenced alert missing from the response's references is left out, and the `notice` names it for `onebusaway_get_alert`; a null `stop` points to `onebusaway_get_stop`.

**Error contract:** same as `onebusaway_get_arrivals` (`stop_not_found`, `rate_limited`).

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_find_stops`

**Description:** Find bus stops near a location. Returns stops within a radius, each with ID, name, direction, served routes, and wheelchair boarding status. Use `stopId` values from results to fetch real-time arrivals. Optionally filter by stop code when you know the number on the bus stop sign.

**Input schema:**
```
lat: number — Latitude of the search center.
lon: number — Longitude of the search center.
radius: number (default 300) — Search radius in meters. Max ~1600m before results degrade.
query: string? — Optional stop code filter (the number printed on the stop sign, e.g. "75403"). When provided, returns only stops matching this code within the radius.
```

**Output schema:**
```
stops: Array of:
  id: string — Agency-prefixed stop ID (e.g. "1_75403").
  code: string — The stop code printed on the sign.
  name: string
  lat: number
  lon: number
  direction: string — Compass direction of travel at this stop (e.g. "NW").
  routeIds: string[] — IDs of routes that serve this stop.
  wheelchairBoarding: "ACCESSIBLE" | "NOT_ACCESSIBLE" | "UNKNOWN"
limitExceeded: boolean — true if more stops exist beyond the returned set; narrow the radius.
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_find_routes`

**Description:** Find transit routes near a location, optionally filtered by name or number. Returns routes with their IDs, short names, and descriptions. Use `routeId` values to fetch schedules, vehicles, or stop sequences.

**Input schema:**
```
lat: number
lon: number
radius: number (default 500) — Search radius in meters.
query: string? — Filter by route name or number (e.g. "44" or "Link Light Rail").
```

**Output schema:**
```
routes: Array of:
  id: string — Agency-prefixed route ID.
  shortName: string — The number or short name displayed on vehicles (e.g. "44").
  longName: string
  description: string
  agencyId: string
  agencyName: string
  type: number — GTFS route type (3=bus, 1=metro, 2=rail, 4=ferry).
  color: string | null — Route brand color hex (without #).
  url: string | null — Agency schedule page URL.
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_stop`

**Description:** Fetch details for a specific stop by ID. Returns the stop's name, coordinates, direction, served routes, and wheelchair accessibility.

**Input schema:**
```
stopId: string — Agency-prefixed stop ID (e.g. "1_75403").
```

**Output schema:**
```
id: string — Agency-prefixed stop ID.
code: string — The stop code printed on the sign.
name: string
lat: number
lon: number
direction: string — Compass direction of travel at this stop (e.g. "NW").
routeIds: string[] — IDs of routes that serve this stop. Use with onebusaway_get_arrivals or onebusaway_get_schedule_for_stop.
wheelchairBoarding: "ACCESSIBLE" | "NOT_ACCESSIBLE" | "UNKNOWN"
```

**Error contract:**
```
{ reason: 'stop_not_found', code: NotFound, when: 'Stop ID does not exist', recovery: 'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_route`

**Description:** Fetch details for a specific route by ID. Returns short name, description, agency, route type, and schedule URL.

**Input schema:**
```
routeId: string — Agency-prefixed route ID (e.g. "1_100259").
```

**Output schema:**
```
id: string — Agency-prefixed route ID.
shortName: string — The number or short name displayed on vehicles (e.g. "44").
longName: string
description: string
agencyId: string
agencyName: string
type: number — GTFS route type (3=bus, 1=metro, 2=rail, 4=ferry).
color: string | null — Route brand color hex (without #).
url: string | null — Agency schedule page URL.
```

**Error contract:**
```
{ reason: 'route_not_found', code: NotFound, when: 'Route ID does not exist', recovery: 'Search for the route with onebusaway_find_routes or onebusaway_search_routes to get a valid ID.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_schedule_for_stop`

**Description:** Full-day departure schedule for a stop. Lists every departure by route and direction for the specified date (defaults to today). Useful for planning or when real-time data isn't needed.

**Input schema:**
```
stopId: string — Agency-prefixed stop ID.
date: string? — A real calendar date as YYYY-MM-DD (e.g. "2026-05-23"). Omitted or "" means today in the agency's timezone.
```

`date` is validated at the schema. OneBusAway parses it leniently — an impossible date such as `2026-99-99` rolls over to another day, an unpadded or datetime form is truncated, and an all-digit value is read as epoch milliseconds — so anything but a real `YYYY-MM-DD` date is rejected before the request.

**Output schema:**
```
stopId: string
stopName: string
serviceDateMs: number — Upstream's `entry.date` as Unix ms: local midnight of the requested date, or the request time when no date was given.
routes: Array of:
  routeId: string — For follow-up onebusaway_get_route or onebusaway_get_schedule_for_route calls.
  routeShortName: string
  directions: Array of:
    tripHeadsign: string
    departures: Array of:
      scheduledDepartureTime: number — Unix ms.
      tripId: string — For follow-up onebusaway_get_trip calls.
```

**Error contract:**
```
{ reason: 'stop_not_found', code: NotFound, when: 'Stop ID does not exist', recovery: 'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_schedule_for_route`

**Description:** Full-day schedule for a route — all trips, stop sequences, and departure times for the specified date (defaults to today).

**Input schema:**
```
routeId: string — Agency-prefixed route ID.
date: string? — A real calendar date as YYYY-MM-DD, validated as for onebusaway_get_schedule_for_stop. Omitted or "" means today.
```

**Output schema:**
```
routeId: string
routeShortName: string
serviceDateMs: number
trips: Array of:
  tripId: string — For follow-up onebusaway_get_trip calls.
  tripHeadsign: string
  serviceId: string
  stops: Array of: { stopId: string, stopName: string, arrivalTime: number, departureTime: number }
```

**Error contract:**
```
{ reason: 'route_not_found', code: NotFound, when: 'Route ID does not exist', recovery: 'Search for the route with onebusaway_find_routes or onebusaway_search_routes to get a valid ID.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_trip`

**Description:** Real-time status and stop sequence for a trip. Returns vehicle position, schedule deviation, current phase, and remaining stops. Use `tripId` from `onebusaway_get_arrivals` to look up a specific vehicle's progress.

**Input schema:**
```
tripId: string — Trip ID from an arrivals response or schedule lookup.
serviceDateMs: non-negative integer? — Service date as Unix ms (midnight local time). Only needed when looking up a trip from a previous service day that hasn't yet cleared (e.g. an overnight trip that departed yesterday). If omitted, the API uses today.
includeSchedule: boolean (default true) — Whether to include the full stop sequence with times.
```

**Output schema:**
```
tripId: string
routeShortName: string
tripHeadsign: string
blockId: string | null — For follow-up onebusaway_get_block calls.
status:
  phase: string — "in_progress" | "layover_before" | "layover_during" | etc.
  predicted: boolean
  position: { lat: number, lon: number } | null
  scheduleDeviation: number — Seconds late (positive) or early (negative).
  nextStop: string | null — Stop ID of next stop.
  closestStop: string | null — Stop ID of closest stop.
  vehicleId: string | null
  lastUpdateTime: number
schedule: Array of: { stopId: string, stopName: string, arrivalTime: number, departureTime: number, distanceAlongTripMeters: number } | null
situations: string[] — Active situation IDs.
```

**Error contract:**
```
{ reason: 'trip_not_found', code: NotFound, when: 'Trip ID not found or not active for the service date', recovery: 'Verify the tripId from an arrivals response; if the trip has completed, fetch the schedule instead.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_alert`

**Description:** Full detail for one service alert (situation) by ID. OneBusAway's SDK has no situation endpoint, so the service calls `/api/where/situation/{id}.json` directly.

**Input schema:**
```
situationId: string — From onebusaway_get_arrivals (situations[].id or arrivals[].situationIds).
```

**Output schema:**
```
id: string
summary: string
description: string | null
reason: string | null — TPEG reason code.
severity: string | null
consequenceMessage: string | null
affects: Array of: { agencyId?, routeId?, stopId?, tripId? } — Empty-string fields upstream pads with are dropped.
consequences: Array of: { condition?, diversionStopIds? }
activeWindows: Array of: { from?: number, to?: number } — Unix ms.
url: string | null
```

**Error contract:**
```
{ reason: 'situation_not_found', code: NotFound, when: 'Situation ID does not exist on this instance', recovery: 'Obtain situation IDs from onebusaway_get_arrivals.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_block`

**Description:** The ordered sequence of trips one vehicle runs in a service day, with stop times. Block IDs come from `onebusaway_get_trip`.

**Input schema:**
```
blockId: string — From onebusaway_get_trip.
```

**Output schema:**
```
blockId: string
activeServiceIds: string[]
inactiveServiceIds: string[]
trips: Array of:
  tripId: string
  distanceAlongBlock: number — Meters from block start.
  accumulatedSlackTime: number — Layover seconds before this trip.
  blockStopTimes: Array of: { stopId: string, arrivalTime: number, departureTime: number, pickupType?: number, dropOffType?: number } — GTFS seconds from midnight.
```

**Error contract:**
```
{ reason: 'block_not_found', code: NotFound, when: 'Block ID does not exist, or the block has no configuration', recovery: 'Obtain a blockId from onebusaway_get_trip.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_get_vehicles`

**Description:** Real-time positions of all active vehicles for an agency. Optionally filter to a single route. Returns GPS coordinates, heading, schedule deviation, and current trip. Useful for "where are all the buses on route X right now?"

**Input schema:**
```
agencyId: string — Agency ID (e.g. "1" for Metro Transit, "40" for Sound Transit). Use onebusaway_list_agencies to discover IDs.
routeId: string? — Optional agency-prefixed route ID to filter results to one route. Filtering is client-side.
```

**Output schema:**
```
vehicles: Array of:
  vehicleId: string
  tripId: string | null
  routeId: string | null
  routeShortName: string | null
  tripHeadsign: string | null
  position: { lat: number, lon: number }
  lastUpdateTime: number
  phase: string
  scheduleDeviation: number | null
  orientation: number | null — Heading in degrees (0=north).
  nextStop: string | null
  predicted: boolean
```

**Error contract:**
```
{ reason: 'agency_not_found', code: NotFound, when: 'Agency ID does not exist on this instance', recovery: 'Use onebusaway_list_agencies to get valid agency IDs for this instance.' }
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_list_agencies`

**Description:** List all transit agencies served by this OneBusAway instance, with their IDs, names, and coverage center. Agency IDs are needed for `onebusaway_list_routes_for_agency` and `onebusaway_get_vehicles`.

**Input schema:** (none)

**Output schema:**
```
agencies: Array of:
  id: string — Agency ID used in other calls.
  name: string
  url: string
  phone: string | null
  timezone: string
  coverageCenter: { lat: number, lon: number }
  coverageSpan: { latSpan: number, lonSpan: number }
```

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `onebusaway_list_routes_for_agency`

**Description:** List all routes operated by an agency. Returns route IDs, short names, and descriptions. Use to enumerate an agency's full service before searching for a specific route.

**Input schema:**
```
agencyId: string — Agency ID from onebusaway_list_agencies.
```

**Output schema:**
```
routes: Array of:
  id: string — Agency-prefixed route ID. Use with onebusaway_get_schedule_for_route or onebusaway_get_vehicles.
  shortName: string
  longName: string
  description: string
  type: number — GTFS route type (3=bus, 1=metro, 2=rail, 4=ferry).
  color: string | null
  url: string | null
```

**Error contract:**
```
{ reason: 'agency_not_found', code: NotFound, when: 'Agency ID does not exist on this instance', recovery: 'Use onebusaway_list_agencies to get valid agency IDs for this instance.' }
```

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `onebusaway_search_stops`

**Description:** Search for stops by name or code. Returns matching stops with IDs and coordinates. Use to resolve a human-readable stop name or number to a stop ID for arrivals lookups.

**Input schema:**
```
query: string — Stop name fragment or stop code (e.g. "University Way" or "75403").
maxCount: number (default 10) — Maximum results to return.
```

**Output schema:**
```
stops: Array of:
  id: string — Agency-prefixed stop ID. Use with onebusaway_get_arrivals.
  code: string
  name: string
  lat: number
  lon: number
  direction: string
  routeIds: string[]
  wheelchairBoarding: "ACCESSIBLE" | "NOT_ACCESSIBLE" | "UNKNOWN"
```

**Annotations:** `readOnlyHint: true`

---

### `onebusaway_search_routes`

**Description:** Search for routes by name or number. Returns matching routes with IDs. Use to resolve a route short name (e.g. "44") to a route ID for schedule or vehicle lookups.

**Input schema:**
```
query: string — Route name or number (e.g. "44" or "Link" or "Rapid Ride").
maxCount: number (default 10) — Maximum results to return.
```

**Output schema:**
```
routes: Array of:
  id: string — Agency-prefixed route ID. Use with onebusaway_get_vehicles or onebusaway_get_schedule_for_route.
  shortName: string
  longName: string
  description: string
  agencyId: string
  agencyName: string
  type: number — GTFS route type (3=bus, 1=metro, 2=rail, 4=ferry).
```

**Annotations:** `readOnlyHint: true`

---

## Workflow Analysis

The core agent workflow for "when's the next bus?" is a two-step chain:

| # | Tool | Purpose |
|:--|:-----|:--------|
| 1 | `onebusaway_find_stops` or `onebusaway_search_stops` | Resolve location or stop name to a stop ID |
| 2 | `onebusaway_get_arrivals` | Fetch real-time predictions using the stop ID |

For "where is the 44 right now?":

| # | Tool | Purpose |
|:--|:-----|:--------|
| 1 | `onebusaway_search_routes` | Resolve "44" to route ID `1_100225` |
| 2 | `onebusaway_get_vehicles` | List vehicles on that route, filtered by `routeId` |

For "what's the schedule for route 44 today?":

| # | Tool | Purpose |
|:--|:-----|:--------|
| 1 | `onebusaway_search_routes` | Resolve to route ID |
| 2 | `onebusaway_get_schedule_for_route` | Full day schedule |

For "is my bus late?":

| # | Tool | Purpose |
|:--|:-----|:--------|
| 1 | `onebusaway_get_arrivals` | Gets a specific arrival with `tripId` and `scheduleDeviation` |
| 2 | `onebusaway_get_trip` (optional) | Deeper vehicle status if needed |

The arrivals response is designed to answer "is my bus late?" in one call — `scheduleDeviation` on each arrival, plus `situationIds` for active alerts. `onebusaway_get_trip` is the follow-up for "show me where the bus is on the map."

For "what's happening at this stop?", `onebusaway_get_stop_context` returns the stop, its arrivals, and every alert in full from one upstream request — the 2+N-call chain of `get_stop`, `get_arrivals`, and `get_alert` per alert collapsed into one.

---

## Design Decisions

### SDK vs. direct HTTP

**Decision: use `onebusaway-sdk`.**

The official TypeScript SDK (`onebusaway-sdk` on npm, Stainless-generated from an OpenAPI spec) covers all relevant endpoints, has full TS types, handles retries with exponential backoff by default (2 retries, with 429/408/500+ retried automatically), and supports `baseURL` override for multi-instance targeting. SDK retries are disabled (`maxRetries: 0`): every retry spends the shared API key's budget, so the service paces requests through a process-wide queue instead of retrying them (see Services).

Direct HTTP would gain nothing here and lose the typed response shapes.

### Multi-instance support

**Decision: single config, no per-call override.**

Two env vars (`ONEBUSAWAY_BASE_URL`, `ONEBUSAWAY_API_KEY`) configure the target instance at startup. A per-call `baseUrl` override parameter was considered but rejected: it creates a security surface (SSRF), complicates the service init pattern, and doesn't match any real agent use case — agents don't switch instances mid-session. Users targeting different cities configure a different server instance or use separate env var profiles.

### Search endpoints vs. location-based discovery

**Decision: expose both search and location-based tools as separate tools.**

The API has two orthogonal discovery paths: location-based (`stops-for-location`, `routes-for-location`) and name-based search (`search/stop`, `search/route`). These serve different agent workflows: "stops near Pike Place Market" vs. "find stop 75403". Merging them into one tool with a `mode` parameter would complicate the common case — the inputs don't overlap and the resolution path differs. Keeping them as `_find_*` (location) and `_search_*` (name/code) is cleaner.

### Real-time vs. scheduled data

**Decision: unified arrivals, separate schedule tools.**

`onebusaway_get_arrivals` returns both predicted (real-time) and scheduled data in every response — the `predicted` boolean on each arrival tells the agent whether GPS is backing the estimate. This is the most important signal for a rider. Separate real-time/scheduled tools would fragment the primary use case ("when's the next bus?") and force the agent to decide up front whether GPS tracking matters.

Schedule tools (`get_schedule_for_stop`, `get_schedule_for_route`) are separate because they serve a different goal — planning, not "right now" — and return full-day timetable data rather than a windowed departure list.

### `arrivals-and-departures-for-location` endpoint

**Decision: omit.**

The SDK exposes `arrivalsAndDeparturesForLocation` which returns arrivals near a lat/lon without a stop ID. This seems convenient but is problematic: it returns a flat list of arrivals from multiple stops, with no clear stop grouping, making the output hard for an agent to reason about. The two-step `find_stops` → `get_arrivals` workflow is only marginally more work and produces cleaner, more actionable output. The location arrivals endpoint is deferred.

### `trips-for-location` endpoint

**Decision: omit.**

Returns active trips near a location but the response shape is sparse (live probe confirmed zero trips returned near downtown Seattle with a 500m radius). The use case — "what buses are driving near me right now?" — is better served by `get_vehicles` (which returns all vehicles for an agency with full status) than a location-filtered trip list with thin data. Deferred.

### Service alerts as inline data

**Decision: inline situations into arrivals responses.**

The OBA response for `arrivals-and-departures-for-stop` includes a `references.situations` block for active service alerts affecting the stop. Rather than requiring a separate alert lookup tool, the `onebusaway_get_arrivals` handler will join the referenced situations into the response body. This surfaces the most relevant information (delays, detours, stop changes) inline with the arrival data, saving a round trip and matching the mental model of "check arrivals + check alerts at once."

### Resources scope

**Decision: stop and route resources only.**

Resources are a convenience surface for clients that support injectable context. Stop and route metadata are stable, addressable by ID, and frequently referenced across tools — they're a good fit for `onebusaway://stop/{stopId}` and `onebusaway://route/{routeId}`. Trip and vehicle state change too fast to be useful as cacheable resources. Agency metadata is covered by `list_agencies` (no stable single-agency URI pattern needed by agents).

### ID format (agency-prefixed)

**Decision: document the format prominently in all `stopId`/`routeId` parameter descriptions.**

OBA IDs use an `{agencyId}_{localId}` format (e.g. `1_75403` for Metro Transit stop 75403, `40_100239` for Sound Transit route). This is not intuitive. Every tool that accepts or returns an ID will document this format in `.describe()` text with examples. The arrivals and stops-near-location tools both return IDs in this format, so agents chaining calls will see the format in the response.

---

## Known Limitations

- **No trip planning.** OneBusAway does not include routing between origin and destination. Direct users to transitapp.com, Google Maps, or OpenTripPlanner for journey planning.
- **Rate limits undocumented but enforced.** The Puget Sound instance enforces rate limits (observed: ~20 req/min per IP). The server will surface 429 with a retry hint. Production use of the TEST key should be replaced with a registered key.
- **Predicted data requires GPS.** Many agencies report vehicles on schedule only. `predicted=false` arrivals are schedule-based estimates. `vehiclePosition` and `scheduleDeviation` are only meaningful when `predicted=true`.
- **Stop IDs are instance-specific.** A stop ID from the Puget Sound instance is not valid on NYC or Tampa. When targeting multiple instances, stop IDs from one cannot be used with another.
- **Schedule data is static.** Schedule tools return GTFS static data. They do not reflect real-time service modifications (cancellations, added trips) unless the OBA instance has a GTFS-RT service alert feed configured.
- **trips-for-location is sparse.** Live testing against the Puget Sound instance showed zero results from a 500m radius query near downtown Seattle. The endpoint is not exposed; use `get_vehicles` instead.
- **Shape/polyline data excluded.** Route and trip shape polylines are returned by some endpoints but are omitted from tool outputs — they're large encoded strings that consume context budget without adding decision-making value for an agent. Expose via `onebusaway_get_route` if a mapping use case emerges.

---

## API Reference

### Response envelope

All endpoints return:
```json
{ "code": 200, "currentTime": 1779558930130, "data": { ... }, "text": "OK", "version": 2 }
```
Non-2xx codes map to errors: 400 (bad request), 401 (bad API key), 404 (not found), 500 (server error), 429 (rate limited — not in the standard OBA spec but enforced by the Puget Sound hosted instance).

### References block

Most responses include a `data.references` block with related entities (agencies, routes, stops, trips, situations) keyed by ID. The OBA SDK does not automatically join these; the service layer must manually resolve references from the `references` block into the tool response.

### Timestamps

All times are Unix milliseconds (not seconds). Service dates (for grouping trips) are milliseconds since epoch at midnight local time. `currentTime` on each response can be used to compute countdown timers relative to predicted arrival times.

### Stop ID format

`{agencyId}_{stopCode}` — e.g. `1_75403` (Metro Transit stop 75403). Agency IDs on the Puget Sound instance: `1` (Metro Transit), `40` (Sound Transit), `3` (Pierce Transit), `29` (Community Transit), `19` (Intercity Transit), `95` (WA State Ferries), `20` (Kitsap Transit), `97` (Everett Transit).

---

## Decisions Log

| Date | Decision | Rationale |
|:-----|:---------|:----------|
| 2026-05-23 | Use `onebusaway-sdk` npm package | Official, TS-native, Stainless-generated from OpenAPI spec; covers all endpoints; built-in retry; `baseURL` override for multi-instance. |
| 2026-05-23 | Disable SDK retries; use service-layer `withRetry` | Prevents double-retry and keeps retry behavior visible in framework telemetry. |
| 2026-05-23 | Single startup config, no per-call `baseUrl` override | Per-call override is an SSRF vector with no real agent use case; multi-city use is a configuration concern, not a runtime concern. |
| 2026-05-23 | Separate `_find_*` (location) and `_search_*` (name) tools | Inputs don't overlap; merging under a `mode` enum complicates the common case without benefit. |
| 2026-05-23 | Unified arrivals tool (real-time + scheduled) | The agent's primary question — "when's the next bus?" — is answered by one call; `predicted` boolean distinguishes GPS-backed from schedule-only estimates. |
| 2026-05-23 | Inline service alerts into arrivals response | Joining `references.situations` into the arrivals response saves a round trip and surfaces the most relevant operational information at the point of use. |
| 2026-05-23 | Omit `arrivals-and-departures-for-location` | Flat multi-stop arrivals list is harder for agents to reason about; `find_stops` + `get_arrivals` is only marginally more work and produces cleaner output. |
| 2026-05-23 | Omit `trips-for-location` | Live testing returned zero results; `get_vehicles` + route filter is a more reliable substitute. |
| 2026-05-23 | Omit shape/polyline data | Large encoded strings with no decision-making value for an agent; can be added later if a mapping use case emerges. |
| 2026-05-23 | Stop + route resources only | Stop/route metadata is stable and ID-addressable; trip/vehicle state changes too fast for cacheable resources. |
| 2026-09-19 | Pace upstream requests through a process-wide queue instead of retrying | One API key is shared by every caller; a retry spends the same budget that is already exhausted. Supersedes the `withRetry` entry above. |
| 2026-09-24 | Bound `minutesBefore` to integers 0–60 and `minutesAfter` to 0–240 | OneBusAway computes the window in unchecked 32-bit arithmetic, so out-of-range values return a wrong window as HTTP 200; 240 minutes is already ~31 KB of arrivals, and longer horizons belong to the schedule tools. |
| 2026-09-24 | Schedule `date` must be a real `YYYY-MM-DD` date (blank = today) | OneBusAway parses dates leniently — impossible dates roll over and all-digit values read as epoch ms — so a malformed date silently returned another day's schedule. |
| 2026-09-24 | Upstream HTTP 400 → non-retryable `ValidationError` | A 400 is a rejected input; reporting it as `ServiceUnavailable` invited retries that can never succeed. |
| 2026-09-24 | Add `onebusaway_get_stop_context` instead of widening `get_arrivals` | The arrivals response already carries the stop and every alert in full, so one request replaces 2+N; `get_arrivals` stays lean. The stop omits `routeIds` because the references copy lists only routes in that response. |
