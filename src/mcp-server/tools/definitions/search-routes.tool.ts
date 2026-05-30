/**
 * @fileoverview Search for routes by name or number.
 * @module mcp-server/tools/definitions/search-routes.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const searchRoutes = tool('onebusaway_search_routes', {
  title: 'Search Routes by Name or Number',
  description:
    'Search for routes by name or number. Returns matching routes with IDs. Use to resolve a route short name (e.g. "44") to a route ID for schedule or vehicle lookups with onebusaway_get_vehicles or onebusaway_get_schedule_for_route.',
  annotations: { readOnlyHint: true },
  input: z.object({
    query: z.string().min(1).describe('Route name or number (e.g. "44", "Link", or "RapidRide").'),
    maxCount: z
      .number()
      .default(10)
      .describe('Maximum number of results to return. Defaults to 10.'),
  }),
  output: z.object({
    routes: z
      .array(
        z
          .object({
            id: z
              .string()
              .describe(
                'Agency-prefixed route ID (e.g. "1_100259"). Use with onebusaway_get_vehicles or onebusaway_get_schedule_for_route.',
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
          })
          .describe('A transit route with agency and type information.'),
      )
      .describe('Routes matching the search query.'),
  }),

  errors: [
    {
      reason: 'endpoint_unavailable',
      code: JsonRpcErrorCode.NotFound,
      when: 'The search/route endpoint returns 404 on this OBA instance (e.g. Puget Sound).',
      recovery:
        'Use onebusaway_find_routes with a lat/lon near the service area, or onebusaway_list_routes_for_agency with a known agency ID to browse all routes.',
    },
  ],

  // Agent-facing context: query echo and empty-result guidance.
  enrichment: {
    query: z.string().describe('Route name/number query sent to the API.'),
    count: z.number().describe('Number of routes returned.'),
    notice: z
      .string()
      .optional()
      .describe(
        'Guidance when no routes matched — e.g. try onebusaway_find_routes with coordinates, or onebusaway_list_routes_for_agency.',
      ),
  },

  async handler(input, ctx) {
    const routes = await getOneBusAwayService().searchRoutes(
      { query: input.query, maxCount: input.maxCount },
      ctx,
    );
    ctx.log.info('searchRoutes completed', { query: input.query, count: routes.length });

    ctx.enrich({ query: input.query, count: routes.length });
    if (routes.length === 0) {
      ctx.enrich.notice(
        `No routes matched "${input.query}". Try onebusaway_find_routes with lat/lon near the service area, or onebusaway_list_routes_for_agency with a known agency ID.`,
      );
    }

    return { routes };
  },

  format: (result) => {
    if (result.routes.length === 0) {
      return [{ type: 'text', text: 'No routes found matching the query.' }];
    }
    const lines: string[] = [`**Routes found:** ${result.routes.length}`];
    for (const r of result.routes) {
      lines.push(`\n## ${r.shortName}${r.longName ? ` — ${r.longName}` : ''}`);
      lines.push(`**ID:** ${r.id} | **Agency:** ${r.agencyName} (${r.agencyId})`);
      if (r.description) lines.push(`**Description:** ${r.description}`);
      lines.push(`**Type:** ${r.type}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
