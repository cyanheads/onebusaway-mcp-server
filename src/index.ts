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
import {
  disposeOneBusAwayService,
  initOneBusAwayService,
} from './services/onebusaway/onebusaway-service.js';

await createApp({
  name: 'onebusaway-mcp-server',
  title: 'onebusaway-mcp-server',
  sessionMode: 'stateless',
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
    'OneBusAway provides stops, routes, arrivals, vehicles, alerts, and timetables for the configured instance (Puget Sound by default), without origin-to-destination trip planning. Stop and route IDs are agency-prefixed and instance-specific: resolve them through discovery before arrivals, schedule, or vehicle calls; do not construct IDs from displayed codes or route numbers. Use stop context for arrivals plus available alert detail, and follow notices for unresolved references. Carry arrival trip IDs into trip lookup and a non-null block ID into block lookup. Name search availability varies by instance; use geographic discovery or agency route listings when it fails. Requests share an upstream API-key budget; honor rate-limit retry guidance. See onebusaway-guide for selection and interpretation gates.',
  setup() {
    initOneBusAwayService(getServerConfig());
  },
  teardown() {
    disposeOneBusAwayService();
  },
});
