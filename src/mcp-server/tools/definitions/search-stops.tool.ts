/**
 * @fileoverview Search for stops by name.
 * @module mcp-server/tools/definitions/search-stops.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import {
  applyReadLimit,
  readCaps,
  readLimit,
  truncatedSearchAdvice,
} from '@/mcp-server/tools/read-limits.js';
import { renderStop, stopRoutesSchema } from '@/mcp-server/tools/stop-shared.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const searchStops = tool('onebusaway_search_stops', {
  title: 'Search Stops by Name',
  description:
    'Search for stops by name on instances that support name search. Returns matching stops with IDs and coordinates. For a stop code, use onebusaway_find_stops with nearby coordinates and the code as query.',
  annotations: { readOnlyHint: true },
  input: z.object({
    query: z.string().min(1).describe('Stop name fragment (e.g. "University Way").'),
    maxCount: readLimit(
      z.number().positive(),
      readCaps.stops,
      10,
      `Maximum number of stops to return. Positive integer, default 10, applied cap ${readCaps.stops}.`,
      true,
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
            direction: z.string().describe('Compass direction of travel at this stop.'),
            routeIds: z.array(z.string()).describe('IDs of routes that serve this stop.'),
            routes: stopRoutesSchema,
            wheelchairBoarding: z
              .enum(['ACCESSIBLE', 'NOT_ACCESSIBLE', 'UNKNOWN'])
              .describe('Wheelchair boarding status.'),
          })
          .describe('A transit stop with location and route information.'),
      )
      .describe('Stops matching the search query.'),
    limitExceeded: z
      .boolean()
      .describe(
        'True if OneBusAway reported additional matching stops beyond the returned results.',
      ),
  }),

  errors: [
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

  // Agent-facing context: query echo and empty-result guidance.
  enrichment: {
    query: z.string().describe('Search query sent to the API.'),
    count: z.number().describe('Number of stops returned.'),
    truncated: z.boolean().optional().describe('True when matching stops exceeded maxCount.'),
    shown: z.number().optional().describe('Number of stops returned when results were truncated.'),
    cap: z.number().optional().describe('The maxCount limit applied to truncated results.'),
    notice: z
      .string()
      .optional()
      .describe('Applied input reductions and guidance when results are empty or truncated.'),
  },

  async handler(input, ctx) {
    const notices: string[] = [];
    const maxCount = applyReadLimit('maxCount', input.maxCount, readCaps.stops, ctx, notices);
    const result = await getOneBusAwayService().searchStops({ query: input.query, maxCount }, ctx);
    ctx.log.info('searchStops completed', {
      query: input.query,
      count: result.stops.length,
      limitExceeded: result.limitExceeded,
    });

    ctx.enrich({ query: input.query, count: result.stops.length });
    if (result.stops.length === 0) {
      notices.push(
        `No stops returned for "${input.query}". Name search may be unavailable on this instance. Try a different name fragment or use onebusaway_find_stops with coordinates and the stop code as query.`,
      );
    }
    if (result.limitExceeded) {
      notices.push(truncatedSearchAdvice(maxCount, readCaps.stops));
      ctx.enrich.truncated({
        shown: result.stops.length,
        cap: maxCount,
        guidance: notices.join(' '),
      });
    } else if (notices.length > 0) {
      ctx.enrich.notice(notices.join(' '));
    }

    return { stops: result.stops, limitExceeded: result.limitExceeded };
  },

  format: (result) => {
    const lines: string[] = [
      `**Stops found:** ${result.stops.length} | **Limit exceeded:** ${result.limitExceeded}`,
    ];
    if (result.limitExceeded) {
      lines.push('> Results truncated.');
    }
    if (result.stops.length === 0) {
      lines.push('No stops returned.');
      return [{ type: 'text', text: lines.join('\n') }];
    }
    for (const s of result.stops) {
      lines.push('', ...renderStop(s));
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
