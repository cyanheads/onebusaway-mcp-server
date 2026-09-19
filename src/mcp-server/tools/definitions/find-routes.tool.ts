/**
 * @fileoverview Find transit routes near a geographic location.
 * @module mcp-server/tools/definitions/find-routes.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const findRoutes = tool('onebusaway_find_routes', {
  title: 'Find Routes Near Location',
  description:
    'Find transit routes near a location, optionally filtered by name or number. Returns routes with IDs, short names, and descriptions. Use routeId values to fetch schedules, vehicles, or stop sequences.',
  annotations: { readOnlyHint: true },
  input: z.object({
    lat: z.number().min(-90).max(90).describe('Latitude of the search center, in [-90, 90].'),
    lon: z.number().min(-180).max(180).describe('Longitude of the search center, in [-180, 180].'),
    radius: z
      .number()
      .positive()
      .max(1600)
      .default(500)
      .describe(
        'Search radius in meters. Must be positive; capped at 1600m. Defaults to 500m. Ignored when latSpan and lonSpan are both set.',
      ),
    latSpan: z
      .number()
      .positive()
      .optional()
      .describe(
        'Optional bounding-box height in degrees, as an alternative to radius. Takes effect only when lonSpan is also set, in which case radius is ignored.',
      ),
    lonSpan: z
      .number()
      .positive()
      .optional()
      .describe(
        'Optional bounding-box width in degrees, as an alternative to radius. Takes effect only when latSpan is also set, in which case radius is ignored.',
      ),
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
    limitExceeded: z
      .boolean()
      .describe(
        'True if more routes exist beyond the returned set; narrow the radius or set latSpan/lonSpan to see all.',
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

  // Agent-facing context: count, query echo, and empty-result guidance.
  enrichment: {
    count: z.number().describe('Number of routes returned.'),
    query: z
      .string()
      .optional()
      .describe('Route name/number filter applied to the search, if any.'),
    notice: z
      .string()
      .optional()
      .describe('Guidance when no routes matched — e.g. try a larger radius or different query.'),
  },

  async handler(input, ctx) {
    // latSpan/lonSpan define a bounding box as an alternative to radius; when both are
    // set, send the box and omit radius so it (not the default radius) drives the search.
    const result = await getOneBusAwayService().findRoutes(
      {
        lat: input.lat,
        lon: input.lon,
        ...(input.latSpan != null && input.lonSpan != null
          ? { latSpan: input.latSpan, lonSpan: input.lonSpan }
          : { radius: input.radius }),
        ...(input.query && { query: input.query }),
      },
      ctx,
    );
    ctx.log.info('findRoutes completed', {
      count: result.routes.length,
      limitExceeded: result.limitExceeded,
    });

    ctx.enrich({ count: result.routes.length, ...(input.query && { query: input.query }) });
    if (result.routes.length === 0) {
      ctx.enrich.notice(
        input.query
          ? `No routes matching "${input.query}" found nearby. Try a larger radius or a different query.`
          : 'No routes found nearby. Try increasing the radius.',
      );
    } else if (result.limitExceeded) {
      ctx.enrich.notice(
        'Results truncated — more routes exist nearby. Narrow the radius (or set latSpan/lonSpan) to see all routes.',
      );
    }

    return { routes: result.routes, limitExceeded: result.limitExceeded };
  },

  format: (result) => {
    const lines: string[] = [
      `**Routes found:** ${result.routes.length} | **Limit exceeded:** ${result.limitExceeded}`,
    ];
    if (result.limitExceeded) {
      lines.push('> Results truncated — narrow the radius to see all routes.');
    }
    if (result.routes.length === 0) {
      lines.push('No routes found near this location.');
      return [{ type: 'text', text: lines.join('\n') }];
    }
    for (const r of result.routes) {
      lines.push(`\n## ${r.shortName}${r.longName ? ` — ${r.longName}` : ''}`);
      lines.push(`**ID:** ${r.id} | **Agency:** ${r.agencyName} (${r.agencyId})`);
      lines.push(`**Description:** ${orNone(r.description)}`);
      lines.push(`**Type:** ${r.type}`);
      lines.push(`**Color:** ${orNone(r.color, (c) => `#${c}`)}`);
      lines.push(`**Schedule URL:** ${orNone(r.url)}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
