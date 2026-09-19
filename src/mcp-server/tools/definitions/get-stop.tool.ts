/**
 * @fileoverview Fetch details for a specific stop by ID.
 * @module mcp-server/tools/definitions/get-stop.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { coords } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const getStop = tool('onebusaway_get_stop', {
  title: 'Get Stop Details',
  description:
    'Fetch details for a specific stop by ID. Returns the stop\'s name, coordinates, direction, served routes, and wheelchair accessibility. Stop IDs use agency-prefixed format: {agencyId}_{localId} (e.g. "1_75403" for Metro Transit stop 75403).',
  annotations: { readOnlyHint: true },
  input: z.object({
    stopId: z
      .string()
      .min(1)
      .describe(
        'Agency-prefixed stop ID (e.g. "1_75403" for Metro Transit stop 75403, "40_100239" for Sound Transit). Use onebusaway_find_stops or onebusaway_search_stops to discover IDs.',
      ),
  }),
  output: z.object({
    id: z.string().describe('Agency-prefixed stop ID.'),
    code: z.string().describe('The stop code printed on the sign.'),
    name: z.string().describe('Stop name.'),
    lat: z.number().describe('Latitude of the stop.'),
    lon: z.number().describe('Longitude of the stop.'),
    direction: z.string().describe('Compass direction of travel at this stop (e.g. "NW").'),
    routeIds: z
      .array(z.string())
      .describe(
        'IDs of routes that serve this stop. Use with onebusaway_get_arrivals or onebusaway_get_schedule_for_stop.',
      ),
    wheelchairBoarding: z
      .enum(['ACCESSIBLE', 'NOT_ACCESSIBLE', 'UNKNOWN'])
      .describe('Wheelchair boarding status.'),
  }),
  errors: [
    {
      reason: 'stop_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Stop ID does not exist on this instance.',
      recovery:
        'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.',
      thrownBy: 'service',
    },
    {
      reason: 'rate_limited',
      code: JsonRpcErrorCode.RateLimited,
      retryable: true,
      when: 'No upstream request slot opened within the queue wait cap, or OneBusAway returned a rate limit response.',
      recovery:
        'Wait the seconds given in data.retryAfter, then retry — one API key is shared across all callers, so requests queue against a global budget rather than failing per caller.',
      thrownBy: 'service',
    },
  ],

  async handler(input, ctx) {
    const stop = await getOneBusAwayService().getStop(input.stopId, ctx);
    ctx.log.info('getStop completed', { stopId: input.stopId });
    return stop;
  },

  format: (result) => {
    const lines: string[] = [
      `## ${result.name}`,
      `**ID:** ${result.id} | **Code:** ${result.code}`,
      `**Direction:** ${result.direction}`,
      `**Coordinates:** ${coords(result.lat, result.lon)}`,
      `**Routes:** ${result.routeIds.join(', ') || 'none'}`,
      `**Wheelchair:** ${result.wheelchairBoarding}`,
    ];
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
