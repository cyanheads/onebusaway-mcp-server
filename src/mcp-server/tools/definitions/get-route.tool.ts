/**
 * @fileoverview Fetch details for a specific route by ID.
 * @module mcp-server/tools/definitions/get-route.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const getRoute = tool('onebusaway_get_route', {
  title: 'Get Route Details',
  description:
    'Fetch details for a specific route by ID. Returns short name, description, agency, route type, and schedule URL. Route IDs use agency-prefixed format: {agencyId}_{localId} (e.g. "1_100259").',
  annotations: { readOnlyHint: true },
  input: z.object({
    routeId: z
      .string()
      .min(1)
      .describe(
        'Agency-prefixed route ID (e.g. "1_100259"). Use onebusaway_find_routes or onebusaway_search_routes to discover IDs.',
      ),
  }),
  output: z.object({
    id: z.string().describe('Agency-prefixed route ID.'),
    shortName: z.string().describe('The number or short name displayed on vehicles (e.g. "44").'),
    longName: z.string().describe('Full route name.'),
    description: z.string().describe('Route description.'),
    agencyId: z.string().describe('Agency ID that operates this route.'),
    agencyName: z.string().describe('Agency name that operates this route.'),
    type: z
      .number()
      .describe('GTFS route type: 0=tram, 1=subway, 2=rail, 3=bus, 4=ferry, 5=cable_car.'),
    color: z.string().nullable().describe('Route brand color hex (without #), or null.'),
    url: z.string().nullable().describe('Agency schedule page URL, or null.'),
  }),
  errors: [
    {
      reason: 'route_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Route ID does not exist on this instance.',
      recovery:
        'Search for the route with onebusaway_find_routes or onebusaway_search_routes to get a valid ID.',
    },
  ],

  async handler(input, ctx) {
    const route = await getOneBusAwayService().getRoute(input.routeId, ctx);
    ctx.log.info('getRoute completed', { routeId: input.routeId });
    return route;
  },

  format: (result) => {
    const lines: string[] = [
      `## ${result.shortName}${result.longName ? ` — ${result.longName}` : ''}`,
      `**ID:** ${result.id}`,
      `**Agency:** ${result.agencyName} (${result.agencyId})`,
    ];
    if (result.description) lines.push(`**Description:** ${result.description}`);
    lines.push(`**Type:** ${result.type}`);
    if (result.color) lines.push(`**Color:** #${result.color}`);
    if (result.url) lines.push(`**Schedule URL:** ${result.url}`);
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
