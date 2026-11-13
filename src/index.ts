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
import { getStopContext } from './mcp-server/tools/definitions/get-stop-context.tool.js';
import { getTrip } from './mcp-server/tools/definitions/get-trip.tool.js';
import { getVehicles } from './mcp-server/tools/definitions/get-vehicles.tool.js';
import { listAgencies } from './mcp-server/tools/definitions/list-agencies.tool.js';
import { listRoutesForAgency } from './mcp-server/tools/definitions/list-routes-for-agency.tool.js';
import { searchRoutes } from './mcp-server/tools/definitions/search-routes.tool.js';
import { searchStops } from './mcp-server/tools/definitions/search-stops.tool.js';
import { enforceReadLimits } from './mcp-server/tools/read-limits.js';
import {
  disposeOneBusAwayService,
  initOneBusAwayService,
} from './services/onebusaway/onebusaway-service.js';

await createApp({
  name: 'onebusaway-mcp-server',
  title: 'onebusaway-mcp-server',
  sessionMode: 'stateless',
  decodeResourceParams: true,
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
    getStopContext,
    getAlert,
    getTrip,
    getBlock,
    getVehicles,
    getScheduleForStop,
    getScheduleForRoute,
  ],
  resources: [stopResource, routeResource],
  prompts: [],
  skills: 'skills',
  instructions:
    'OneBusAway provides stops, routes, arrivals, vehicles, alerts, and timetables for the configured instance (Puget Sound by default). Pass instance-specific raw IDs exactly as discovery tools return them. Use stop context for arrivals plus available alert detail, and follow notices for unresolved references. Carry arrival trip IDs into trip lookup and a non-null block ID into block lookup. Use geographic discovery or agency route listings when name search returns no results or fails. For stop codes, use onebusaway_find_stops with nearby coordinates and the code as query. Vehicle queries use the vehicle ID’s agency namespace, which can differ from the route agency. Requests share an upstream API-key budget; honor rate-limit retry guidance. See onebusaway-guide for selection and interpretation.',
  setup() {
    const config = getServerConfig();
    if (!config.clampLimits) {
      for (const definition of [
        findStops,
        findRoutes,
        searchStops,
        searchRoutes,
        getArrivals,
        getStopContext,
      ]) {
        enforceReadLimits(definition);
      }
    }
    initOneBusAwayService(config);
  },
  teardown() {
    disposeOneBusAwayService();
  },
});
