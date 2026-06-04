# Changelog

All notable changes to this project. Each entry links to its full per-version file in [changelog/](changelog/).

## [0.1.8](changelog/0.1.x/0.1.8.md) — 2026-06-04

Add Sound Transit Transit Data Terms of Use compliance section to README.

## [0.1.7](changelog/0.1.x/0.1.7.md) — 2026-06-02

Adopt @cyanheads/mcp-ts-core ^0.9.21 — per-request log context fix, secret scrubbing in fetchWithTimeout, and fail-fast retries.

## [0.1.6](changelog/0.1.x/0.1.6.md) — 2026-05-30

Service alert + block schedule tools; error-contract data.reason fix; list-routes-for-agency empty-result notice.

## [0.1.5](changelog/0.1.x/0.1.5.md) — 2026-05-30

Enrichment adoption — find/search/arrivals/schedule/vehicles tools now surface query echoes, result counts, and empty-result guidance in a typed enrichment block reaching both structuredContent and content[] channels.

## [0.1.4](changelog/0.1.x/0.1.4.md) — 2026-05-28

@cyanheads/mcp-ts-core ^0.9.7 → ^0.9.13; HTTP 413 body cap, session-init gate, quieter 401/403/400/404 logging, GET /mcp surfaces keywords; dep refresh; landing requireAuth fix

## [0.1.3](changelog/0.1.x/0.1.3.md) — 2026-05-23

Add hosted server endpoint metadata (remotes block, public URL)

## [0.1.2](changelog/0.1.x/0.1.2.md) — 2026-05-23

Fix get_schedule_for_route crash, search_routes empty-result handling, Dockerfile + package.json standardization

## [0.1.1](changelog/0.1.x/0.1.1.md) — 2026-05-23

OneBusAway transit API — 13 tools, 2 resources, real-time arrivals, routes, stops, and vehicles

## [0.1.0](changelog/0.1.x/0.1.0.md) — 2026-05-23

Initial release — 13 tools and 2 resources for OneBusAway transit data via onebusaway-sdk
