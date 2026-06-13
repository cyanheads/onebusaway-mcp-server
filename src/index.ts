#!/usr/bin/env node
/**
 * @fileoverview onebusaway-mcp-server MCP server entry point.
 * @module index
 */

import { createApp } from '@cyanheads/mcp-ts-core';
import { getServerConfig } from './config/server-config.js';
// Resources
import { routeResource } from './mcp-server/resources/definitions/route.resource.js';
import { stopResource } from './mcp-server/resources/definitions/stop.resource.js';
// Tools
import { findRoutes } from './mcp-server/tools/definitions/find-routes.tool.js';
import { findStops } from './mcp-server/tools/definitions/find-stops.tool.js';
import { getAlert } from './mcp-server/tools/definitions/get-alert.tool.js';
import { getArrivals } from './mcp-server/tools/definitions/get-arrivals.tool.js';
import { getBlock } from './mcp-server/tools/definitions/get-block.tool.js';
import { getRoute } from './mcp-server/tools/definitions/get-route.tool.js';
import { getScheduleForRoute } from './mcp-server/tools/definitions/get-schedule-for-route.tool.js';
import { getScheduleForStop } from './mcp-server/tools/definitions/get-schedule-for-stop.tool.js';
import { getStop } from './mcp-server/tools/definitions/get-stop.tool.js';
import { getTrip } from './mcp-server/tools/definitions/get-trip.tool.js';
import { getVehicles } from './mcp-server/tools/definitions/get-vehicles.tool.js';
import { listAgencies } from './mcp-server/tools/definitions/list-agencies.tool.js';
import { listRoutesForAgency } from './mcp-server/tools/definitions/list-routes-for-agency.tool.js';
import { searchRoutes } from './mcp-server/tools/definitions/search-routes.tool.js';
import { searchStops } from './mcp-server/tools/definitions/search-stops.tool.js';
import { initOneBusAwayService } from './services/onebusaway/onebusaway-service.js';

await createApp({
  name: 'onebusaway-mcp-server',
  title: 'onebusaway-mcp-server',
  // Public hosted catalog — serve full inventory without auth gate.
  landing: { requireAuth: false },
  tools: [
    listAgencies,
    findStops,
    findRoutes,
    searchStops,
    searchRoutes,
    getStop,
    getRoute,
    listRoutesForAgency,
    getArrivals,
    getAlert,
    getTrip,
    getBlock,
    getVehicles,
    getScheduleForStop,
    getScheduleForRoute,
  ],
  resources: [stopResource, routeResource],
  prompts: [],
  instructions:
    'OneBusAway MCP server — real-time transit data for Puget Sound (King County Metro, Sound Transit, Pierce Transit, Community Transit, and more) and other OneBusAway instances.\n' +
    '- Stop IDs use agency-prefixed format: {agencyId}_{localId} (e.g. "1_75403" for Metro Transit stop 75403)\n' +
    '- To get arrivals: use onebusaway_find_stops or onebusaway_search_stops to resolve a location/name to a stopId, then call onebusaway_get_arrivals\n' +
    '- For "where is the 44?": use onebusaway_search_routes to get routeId, then onebusaway_get_vehicles\n' +
    '- For service alert details: get a situationId from onebusaway_get_arrivals (situations[].id), then call onebusaway_get_alert\n' +
    "- For a vehicle's full day schedule: get a tripId from onebusaway_get_arrivals, call onebusaway_get_trip to find the blockId, then call onebusaway_get_block\n" +
    '- OneBusAway does not include trip planning — direct users to Google Maps or Transit app for routing',
  setup() {
    initOneBusAwayService(getServerConfig());
  },
});
