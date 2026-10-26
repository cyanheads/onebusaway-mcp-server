---
name: onebusaway-guide
description: Resolve and interpret onebusaway_* transit results when choosing a boarding stop, tracking a route or trip, checking disruptions, or reading service-day schedules. Use for multi-step questions where direction, agency, missing telemetry, or scheduled versus predicted times change the answer.
license: Apache-2.0
metadata:
  author: "cyanheads"
  version: "1.0"
---

## Scope

Use OneBusAway for service at known stops, route timetables, and available real-time telemetry. For an origin-to-destination journey, obtain a routing plan elsewhere before using these tools to check its stops and departures. Coverage belongs to the configured instance; a failed lookup does not establish that transit service is absent in a city.

## Identifiers

| Identifier | Obtain from |
|:-----------|:------------|
| Agency | `onebusaway_list_agencies`, or the agency attached to a discovered route |
| Stop | `onebusaway_find_stops` or `onebusaway_search_stops`; trip stop sequences also carry stop IDs |
| Route | Route discovery, agency route listings, a stop's served-route IDs, or an arrival |
| Trip | An arrival or schedule departure |
| Situation | Arrival situation IDs or the situations returned alongside arrivals; trip results also reference situations |
| Block | A non-null block ID from `onebusaway_get_trip` |

Keep the identifiers attached to the same instance and agency throughout the chain. A vehicle ID identifies a vehicle; use the trip ID returned with an arrival or vehicle record for trip lookup.

## Gates

- Before choosing a boarding stop, reconcile its location, travel direction, served route, and arrival headsign with the rider's destination. Opposite directions can have similar stop names. When the available results cannot distinguish the intended stop, resolve that ambiguity before giving boarding advice.
- Before tracking a numbered route, identify its operating agency as well as its route ID. Use that agency for vehicle lookup; a display number alone does not establish identity.
- Before declaring a route or stop absent, try an appropriate alternate discovery path. Name-search support varies; an empty search is not coverage proof. Use coordinates near the service area, or discover the agency and browse its routes. Check `limitExceeded` before treating any returned list as complete.
- Before calling an arrival late or early, check `predicted`. Schedule-only arrivals do not establish a live delay, and a missing position does not establish that a bus is not running. Report the distinction to the rider.
- Before interpreting an empty arrivals response as no service, check the requested window and then the dated stop schedule. An empty vehicle response also does not prove no service: the agency may lack real-time telemetry.
- Before concluding there are no disruptions, inspect notices about unresolved alert references. Missing alert detail is unknown, not an all-clear.
- Before presenting a local clock time, establish the agency timezone. Arrival and stop-schedule timestamps are epoch milliseconds; trip stop-sequence times are GTFS seconds from midnight. Keep extended service-day hours attached to their service day rather than silently wrapping them into the same day's early morning.
- Before using a block as a particular day's operating schedule, establish which service-calendar conditions apply. A block groups trips; its first returned configuration alone does not establish today's service.

## Workflows

For the next departure toward a destination, discover candidate stops and apply the boarding-stop gate. Use `onebusaway_get_arrivals` for a departure check, or `onebusaway_get_stop_context` when the question includes disruptions. Match the route and headsign before selecting an arrival. Compute a countdown from the selected predicted timestamp when available, otherwise the scheduled timestamp, relative to response `currentTime`; label a schedule-only result accordingly.

For a particular bus's progress, start with the matching arrival's trip ID and use `onebusaway_get_trip`. Check the update timestamp before describing the position as current. A missing or inactive trip is a reason to consult its route schedule, not proof of cancellation. Follow a non-null block ID only when the question concerns the vehicle's other trips.

For route-wide vehicle locations, discover the route and agency, then use `onebusaway_get_vehicles`. Separate returned positions from conclusions about the route's entire operation; missing telemetry and upstream limits restrict what the snapshot establishes.

For tomorrow or another service day, choose the date in the agency's timezone and use the stop schedule for departures from one boarding point or the route schedule for the wider timetable. Timetable entries establish scheduled service, not a live prediction. For an after-midnight question, keep the requested calendar time and transit service day explicit before following a schedule trip into live trip lookup.

For a disruption investigation, reuse full alerts already returned by stop context. Fetch `onebusaway_get_alert` for an unresolved situation ID or when only a particular alert is needed. Keep unresolved references visible in the answer.
