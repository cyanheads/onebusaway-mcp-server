/**
 * @fileoverview List all routes operated by a specific agency.
 * @module mcp-server/tools/definitions/list-routes-for-agency.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const listRoutesForAgency = tool('onebusaway_list_routes_for_agency', {
  title: 'List Routes for Agency',
  description:
    "List all routes operated by an agency. Returns route IDs, short names, and descriptions. Use to enumerate an agency's full service before searching for a specific route. Get agencyId values from onebusaway_list_agencies.",
  annotations: { readOnlyHint: true, openWorldHint: false },
  input: z.object({
    agencyId: z
      .string()
      .min(1)
      .describe(
        'Agency ID (e.g. "1" for Metro Transit, "40" for Sound Transit). Use onebusaway_list_agencies to discover IDs.',
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
                'Agency-prefixed route ID. Use with onebusaway_get_schedule_for_route or onebusaway_get_vehicles.',
              ),
            shortName: z.string().describe('The number or short name displayed on vehicles.'),
            longName: z.string().describe('Full route name.'),
            description: z.string().describe('Route description.'),
            type: z
              .number()
              .describe('GTFS route type: 0=tram, 1=subway, 2=rail, 3=bus, 4=ferry, 5=cable_car.'),
            color: z.string().nullable().describe('Route brand color hex (without #), or null.'),
            url: z.string().nullable().describe('Agency schedule page URL, or null.'),
          })
          .describe('A transit route operated by this agency.'),
      )
      .describe('All routes operated by this agency.'),
    limitExceeded: z
      .boolean()
      .describe(
        'True if the upstream capped the route list — some routes were omitted. This endpoint has no pagination to retrieve them.',
      ),
  }),
  errors: [
    {
      reason: 'agency_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Agency ID does not exist on this instance.',
      recovery: 'Use onebusaway_list_agencies to get valid agency IDs for this instance.',
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

  // Agent-facing context: agency echo, route count, and empty-result guidance.
  enrichment: {
    agencyId: z.string().describe('Agency ID queried.'),
    count: z.number().describe('Number of routes returned for this agency.'),
    notice: z
      .string()
      .optional()
      .describe(
        'Guidance when no routes were found — verify the agency ID with onebusaway_list_agencies.',
      ),
  },

  async handler(input, ctx) {
    const result = await getOneBusAwayService().listRoutesForAgency(input.agencyId, ctx);
    ctx.log.info('listRoutesForAgency completed', {
      agencyId: input.agencyId,
      count: result.routes.length,
      limitExceeded: result.limitExceeded,
    });

    ctx.enrich({ agencyId: input.agencyId, count: result.routes.length });
    if (result.routes.length === 0) {
      ctx.enrich.notice(
        `No routes found for agency ${input.agencyId}. Verify the agency ID with onebusaway_list_agencies.`,
      );
    } else if (result.limitExceeded) {
      ctx.enrich.notice(
        'Results truncated upstream — some routes for this agency were omitted; this endpoint has no pagination to retrieve the rest.',
      );
    }

    return { routes: result.routes, limitExceeded: result.limitExceeded };
  },

  format: (result) => {
    const lines: string[] = [
      `**Routes:** ${result.routes.length} | **Limit exceeded:** ${result.limitExceeded}`,
    ];
    if (result.limitExceeded) {
      lines.push('> Results truncated upstream — some routes omitted (no pagination available).');
    }
    if (result.routes.length === 0) {
      lines.push('No routes found for this agency.');
      return [{ type: 'text', text: lines.join('\n') }];
    }
    for (const r of result.routes) {
      lines.push(`\n## ${r.shortName}${r.longName ? ` — ${r.longName}` : ''}`);
      lines.push(`**ID:** ${r.id} | **Type:** ${r.type}`);
      lines.push(`**Description:** ${orNone(r.description)}`);
      lines.push(`**Color:** ${orNone(r.color, (c) => `#${c}`)}`);
      lines.push(`**Schedule URL:** ${orNone(r.url)}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
