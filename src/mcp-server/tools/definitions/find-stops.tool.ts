/**
 * @fileoverview Find bus stops near a geographic location.
 * @module mcp-server/tools/definitions/find-stops.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const findStops = tool('onebusaway_find_stops', {
  title: 'Find Stops Near Location',
  description:
    'Find bus stops near a location. Returns stops within a radius, each with ID, name, direction, served routes, and wheelchair boarding status. Use stopId values from results to fetch real-time arrivals with onebusaway_get_arrivals. Optionally filter by stop code (the number printed on the stop sign, e.g. "75403").',
  annotations: { readOnlyHint: true },
  input: z.object({
    lat: z.number().describe('Latitude of the search center.'),
    lon: z.number().describe('Longitude of the search center.'),
    radius: z
      .number()
      .default(300)
      .describe('Search radius in meters. Defaults to 300m. Max ~1600m before results degrade.'),
    query: z
      .string()
      .optional()
      .describe(
        'Optional stop code filter (the number printed on the stop sign, e.g. "75403"). When provided, returns only stops matching this code within the radius.',
      ),
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
            direction: z.string().describe('Compass direction of travel at this stop (e.g. "NW").'),
            routeIds: z.array(z.string()).describe('IDs of routes that serve this stop.'),
            wheelchairBoarding: z
              .enum(['ACCESSIBLE', 'NOT_ACCESSIBLE', 'UNKNOWN'])
              .describe('Wheelchair boarding status.'),
          })
          .describe('A transit stop with location and route information.'),
      )
      .describe('Stops within the search radius.'),
    limitExceeded: z
      .boolean()
      .describe('True if more stops exist beyond the returned set; narrow the radius to see all.'),
  }),

  async handler(input, ctx) {
    const result = await getOneBusAwayService().findStops(
      {
        lat: input.lat,
        lon: input.lon,
        radius: input.radius,
        ...(input.query && { query: input.query }),
      },
      ctx,
    );
    ctx.log.info('findStops completed', {
      count: result.stops.length,
      limitExceeded: result.limitExceeded,
    });
    return result;
  },

  format: (result) => {
    const lines: string[] = [
      `**Stops found:** ${result.stops.length} | **Limit exceeded:** ${result.limitExceeded}`,
    ];
    if (result.limitExceeded) {
      lines.push('> Results truncated — narrow the radius to see all stops.');
    }
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
