/**
 * @fileoverview Search for stops by name or code string.
 * @module mcp-server/tools/definitions/search-stops.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const searchStops = tool('onebusaway_search_stops', {
  title: 'Search Stops by Name or Code',
  description:
    'Search for stops by name or code. Returns matching stops with IDs and coordinates. Use to resolve a human-readable stop name or number to a stop ID for arrivals lookups with onebusaway_get_arrivals.',
  annotations: { readOnlyHint: true },
  input: z.object({
    query: z
      .string()
      .min(1)
      .describe('Stop name fragment or stop code (e.g. "University Way" or "75403").'),
    maxCount: z
      .number()
      .default(10)
      .describe('Maximum number of results to return. Defaults to 10.'),
  }),
  output: z.object({
    stops: z
      .array(
        z
          .object({
            id: z
              .string()
              .describe(
                'Agency-prefixed stop ID (e.g. "1_75403"). Use with onebusaway_get_arrivals.',
              ),
            code: z.string().describe('The stop code printed on the sign.'),
            name: z.string().describe('Stop name.'),
            lat: z.number().describe('Latitude of the stop.'),
            lon: z.number().describe('Longitude of the stop.'),
            direction: z.string().describe('Compass direction of travel at this stop.'),
            routeIds: z.array(z.string()).describe('IDs of routes that serve this stop.'),
            wheelchairBoarding: z
              .enum(['ACCESSIBLE', 'NOT_ACCESSIBLE', 'UNKNOWN'])
              .describe('Wheelchair boarding status.'),
          })
          .describe('A transit stop with location and route information.'),
      )
      .describe('Stops matching the search query.'),
  }),

  async handler(input, ctx) {
    const stops = await getOneBusAwayService().searchStops(
      { query: input.query, maxCount: input.maxCount },
      ctx,
    );
    ctx.log.info('searchStops completed', { query: input.query, count: stops.length });
    return { stops };
  },

  format: (result) => {
    if (result.stops.length === 0) {
      return [{ type: 'text', text: 'No stops found matching the query.' }];
    }
    const lines: string[] = [`**Stops found:** ${result.stops.length}`];
    for (const s of result.stops) {
      lines.push(`\n## ${s.name}`);
      lines.push(`**ID:** ${s.id} | **Code:** ${s.code} | **Direction:** ${s.direction}`);
      lines.push(`**Coordinates:** ${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}`);
      lines.push(`**Routes:** ${s.routeIds.join(', ') || 'none'}`);
      lines.push(`**Wheelchair:** ${s.wheelchairBoarding}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
