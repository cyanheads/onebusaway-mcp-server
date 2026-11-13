/**
 * @fileoverview Search for routes by name or number.
 * @module mcp-server/tools/definitions/search-routes.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { orNone } from '@/mcp-server/tools/format-helpers.js';
import {
  applyReadLimit,
  readCaps,
  readLimit,
  truncatedSearchAdvice,
} from '@/mcp-server/tools/read-limits.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const searchRoutes = tool('onebusaway_search_routes', {
  title: 'Search Routes by Name or Number',
  description:
    'Search for routes by name or number on instances that support name search. Returns matching routes with IDs. For route discovery use onebusaway_find_routes near the service area or onebusaway_list_routes_for_agency with a known agency ID.',
  annotations: { readOnlyHint: true },
  input: z.object({
    query: z.string().min(1).describe('Route name or number (e.g. "44", "Link", or "RapidRide").'),
    maxCount: readLimit(
      z.number().positive(),
      readCaps.routes,
      10,
      `Maximum number of routes to return. Positive integer, default 10, applied cap ${readCaps.routes}.`,
      true,
    ),
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
    limitExceeded: z
      .boolean()
      .describe(
        'True if OneBusAway reported additional matching routes beyond the returned results.',
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
    query: z.string().describe('Route name/number query sent to the API.'),
    count: z.number().describe('Number of routes returned.'),
    truncated: z.boolean().optional().describe('True when matching routes exceeded maxCount.'),
    shown: z.number().optional().describe('Number of routes returned when results were truncated.'),
    cap: z.number().optional().describe('The maxCount limit applied to truncated results.'),
    notice: z
      .string()
      .optional()
      .describe('Applied input reductions and guidance when results are empty or truncated.'),
  },

  async handler(input, ctx) {
    const notices: string[] = [];
    const maxCount = applyReadLimit('maxCount', input.maxCount, readCaps.routes, ctx, notices);
    const result = await getOneBusAwayService().searchRoutes({ query: input.query, maxCount }, ctx);
    ctx.log.info('searchRoutes completed', {
      query: input.query,
      count: result.routes.length,
      limitExceeded: result.limitExceeded,
    });

    ctx.enrich({ query: input.query, count: result.routes.length });
    if (result.routes.length === 0) {
      notices.push(
        `No routes returned for "${input.query}". Name search may be unavailable on this instance. Try onebusaway_find_routes with coordinates near the service area or onebusaway_list_routes_for_agency with a known agency ID.`,
      );
    }
    if (result.limitExceeded) {
      notices.push(truncatedSearchAdvice(maxCount, readCaps.routes));
      ctx.enrich.truncated({
        shown: result.routes.length,
        cap: maxCount,
        guidance: notices.join(' '),
      });
    } else if (notices.length > 0) {
      ctx.enrich.notice(notices.join(' '));
    }

    return { routes: result.routes, limitExceeded: result.limitExceeded };
  },

  format: (result) => {
    const lines: string[] = [
      `**Routes found:** ${result.routes.length} | **Limit exceeded:** ${result.limitExceeded}`,
    ];
    if (result.limitExceeded) {
      lines.push('> Results truncated.');
    }
    if (result.routes.length === 0) {
      lines.push('No routes returned.');
      return [{ type: 'text', text: lines.join('\n') }];
    }
    for (const r of result.routes) {
      lines.push(`\n## ${r.shortName}${r.longName ? ` — ${r.longName}` : ''}`);
      lines.push(`**ID:** ${r.id} | **Agency:** ${r.agencyName} (${r.agencyId})`);
      lines.push(`**Description:** ${orNone(r.description)}`);
      lines.push(`**Type:** ${r.type}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
