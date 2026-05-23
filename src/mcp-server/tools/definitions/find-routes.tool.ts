/**
 * @fileoverview Find transit routes near a geographic location.
 * @module mcp-server/tools/definitions/find-routes.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const findRoutes = tool('onebusaway_find_routes', {
  title: 'Find Routes Near Location',
  description:
    'Find transit routes near a location, optionally filtered by name or number. Returns routes with IDs, short names, and descriptions. Use routeId values to fetch schedules, vehicles, or stop sequences.',
  annotations: { readOnlyHint: true },
  input: z.object({
    lat: z.number().describe('Latitude of the search center.'),
    lon: z.number().describe('Longitude of the search center.'),
    radius: z.number().default(500).describe('Search radius in meters. Defaults to 500m.'),
    query: z
      .string()
      .optional()
      .describe('Filter by route name or number (e.g. "44" or "Link Light Rail").'),
  }),
  output: z.object({
    routes: z
      .array(
        z
          .object({
            id: z
              .string()
              .describe(
                'Agency-prefixed route ID (e.g. "1_100259"). Use with onebusaway_get_schedule_for_route or onebusaway_get_vehicles.',
              ),
            shortName: z
              .string()
              .describe('The number or short name displayed on vehicles (e.g. "44").'),
            longName: z.string().describe('Full route name.'),
            description: z.string().describe('Route description.'),
            agencyId: z.string().describe('Agency ID that operates this route.'),
            agencyName: z.string().describe('Agency name that operates this route.'),
            type: z
              .number()
              .describe('GTFS route type: 0=tram, 1=subway, 2=rail, 3=bus, 4=ferry, 5=cable_car.'),
            color: z.string().nullable().describe('Route brand color hex (without #), or null.'),
            url: z.string().nullable().describe('Agency schedule page URL, or null.'),
          })
          .describe('A transit route with agency and type information.'),
      )
      .describe('Routes found near the specified location.'),
  }),

  async handler(input, ctx) {
    const routes = await getOneBusAwayService().findRoutes(
      {
        lat: input.lat,
        lon: input.lon,
        radius: input.radius,
        ...(input.query && { query: input.query }),
      },
      ctx,
    );
    ctx.log.info('findRoutes completed', { count: routes.length });
    return { routes };
  },

  format: (result) => {
    if (result.routes.length === 0) {
      return [{ type: 'text', text: 'No routes found near this location.' }];
    }
    const lines: string[] = [`**Routes found:** ${result.routes.length}`];
    for (const r of result.routes) {
      lines.push(`\n## ${r.shortName}${r.longName ? ` — ${r.longName}` : ''}`);
      lines.push(`**ID:** ${r.id} | **Agency:** ${r.agencyName} (${r.agencyId})`);
      if (r.description) lines.push(`**Description:** ${r.description}`);
      lines.push(`**Type:** ${r.type}`);
      if (r.color) lines.push(`**Color:** #${r.color}`);
      if (r.url) lines.push(`**Schedule URL:** ${r.url}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
