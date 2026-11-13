---
name: onebusaway-guide
description: Resolve and interpret onebusaway_* transit results when choosing a boarding stop, tracking a route or trip, checking disruptions, or reading service-day schedules. Use for multi-step questions where direction, agency, missing telemetry, or scheduled versus predicted times change the answer.
license: Apache-2.0
metadata:
  author: "cyanheads"
  version: "1.1"
---

## Scope

Use OneBusAway for service at known stops, route timetables, and available real-time telemetry. For an origin-to-destination journey, obtain a routing plan elsewhere before using these tools to check its stops and departures. Coverage belongs to the configured instance; a failed lookup does not establish that transit service is absent in a city.

## Identifiers

| Identifier | Obtain from |
|:-----------|:------------|
| Agency | `onebusaway_list_agencies` or a discovered route; for vehicle lookup, use the namespace prefix of a known `vehicleId` |
| Stop | `onebusaway_search_stops` for names, or `onebusaway_find_stops` for location and an optional stop code; trip stop sequences also carry stop IDs |
| Route | `onebusaway_find_routes`, `onebusaway_list_routes_for_agency`, a stop's `routeIds`, or an arrival |
| Trip | An arrival or schedule departure |
| Situation | Arrival situation IDs or the situations returned alongside arrivals; trip results also reference situations |
| Block | A non-null block ID from `onebusaway_get_trip` |

Pass raw IDs from the same configured instance as tool arguments; resource URIs accept URI encoding for their ID segment. Use the trip ID from an arrival or vehicle record for trip lookup.

## Gates

- Before choosing a boarding stop, reconcile its location, travel direction, served route, and arrival headsign with the rider's destination. Opposite directions can have similar stop names. When the available results cannot distinguish the intended stop, resolve that ambiguity before giving boarding advice.
- Before tracking a numbered route, resolve its exact route ID and the vehicle agency namespace. A route can be operated by a different agency from the one in its vehicles' IDs.
- Before declaring a route or stop absent, try an appropriate alternate discovery path. Name-search support varies; an empty search is not coverage proof. Use coordinates near the service area, or discover the agency and browse its routes. Check `limitExceeded` before treating any returned list as complete.
- For a predicted arrival's delay at the stop, compare `predictedArrivalTime` with `scheduledArrivalTime`. `scheduleDeviation` describes the vehicle's current timing. `stopsAway` is a signed block stop sequence offset; zero can also mean unavailable.
- Before interpreting an empty arrivals response as no service, check the applied window and then the dated stop schedule. If a notice reports a reduced radius, count, or window, use the applied value when describing coverage. An empty vehicle response may reflect missing real-time telemetry.
- Before concluding there are no disruptions, inspect notices about unresolved alert references. Missing alert detail is unknown, not an all-clear.
- Before presenting a local clock time, establish the agency timezone. Arrival and stop-schedule timestamps are epoch milliseconds; trip stop-sequence times are GTFS seconds from midnight. Keep extended service-day hours attached to their service day rather than silently wrapping them into the same day's early morning.
- Before using a block as a particular day's operating schedule, establish which service-calendar conditions apply. A block groups trips; its first returned configuration alone does not establish today's service.

## Workflows

For the next departure toward a destination, discover candidate stops and apply the boarding-stop gate. Use `onebusaway_get_arrivals` for a departure check, or `onebusaway_get_stop_context` when the question includes disruptions. Match the route and headsign before selecting an arrival. Compute a countdown from the selected predicted timestamp when available, otherwise the scheduled timestamp, relative to response `currentTime`; label a schedule-only result accordingly.

For a particular bus's progress, start with the matching arrival's trip ID and use `onebusaway_get_trip`. Check the update timestamp and `status.activeTripId` before attributing live status to a trip. The top-level schedule belongs to the requested trip. If the trip lookup fails, consult its route schedule. Follow a non-null block ID when the question concerns the vehicle's other trips.

For route-wide vehicle locations, pass the route ID and vehicle agency namespace to `onebusaway_get_vehicles`. Scope the answer to the requested namespace and check for missing positions and upstream truncation.

For tomorrow or another service day, choose the date in the agency's timezone and use the stop schedule for departures from one boarding point or the route schedule for the wider timetable. Timetable entries establish scheduled service, not a live prediction. For an after-midnight question, keep the requested calendar time and transit service day explicit before following a schedule trip into live trip lookup.

For a disruption investigation, reuse full alerts already returned by stop context. Fetch `onebusaway_get_alert` for an unresolved situation ID or when only a particular alert is needed. Keep unresolved references visible in the answer.
