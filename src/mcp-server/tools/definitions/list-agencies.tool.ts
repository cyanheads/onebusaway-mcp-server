/**
 * @fileoverview List all transit agencies on this OneBusAway instance.
 * @module mcp-server/tools/definitions/list-agencies.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { coords, orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const listAgencies = tool('onebusaway_list_agencies', {
  title: 'List Transit Agencies',
  description:
    'List all transit agencies served by this OneBusAway instance. Returns agency IDs, names, contact info, timezone, and geographic coverage center. Agency IDs are needed for onebusaway_list_routes_for_agency and onebusaway_get_vehicles.',
  annotations: { readOnlyHint: true, openWorldHint: false },
  input: z.object({}),
  output: z.object({
    agencies: z
      .array(
        z
          .object({
            id: z.string().describe('Agency ID used in other calls (e.g. "1" for Metro Transit).'),
            name: z.string().describe('Full agency name.'),
            url: z.string().describe('Agency website URL.'),
            phone: z.string().nullable().describe('Agency phone number, or null if not provided.'),
            timezone: z.string().describe('Agency timezone (e.g. "America/Los_Angeles").'),
            coverageCenter: z
              .object({
                lat: z.number().describe('Latitude of the coverage center.'),
                lon: z.number().describe('Longitude of the coverage center.'),
              })
              .describe("Geographic center of the agency's service area."),
            coverageSpan: z
              .object({
                latSpan: z.number().describe('Latitude span of the coverage area in degrees.'),
                lonSpan: z.number().describe('Longitude span of the coverage area in degrees.'),
              })
              .describe("Geographic extent of the agency's service area."),
          })
          .describe('A transit agency with coverage information.'),
      )
      .describe('All agencies served by this OneBusAway instance.'),
    limitExceeded: z
      .boolean()
      .describe(
        'True if the upstream capped the agency list — some agencies were omitted. This endpoint has no pagination to retrieve them.',
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

  // Agent-facing context: count of agencies returned.
  enrichment: {
    count: z.number().describe('Number of transit agencies returned.'),
    notice: z.string().optional().describe('Guidance when no agencies were returned.'),
  },

  async handler(_input, ctx) {
    const result = await getOneBusAwayService().listAgencies(ctx);
    ctx.log.info('listAgencies completed', {
      count: result.agencies.length,
      limitExceeded: result.limitExceeded,
    });

    ctx.enrich({ count: result.agencies.length });
    if (result.agencies.length === 0) {
      ctx.enrich.notice(
        'No agencies returned. The OneBusAway instance may be misconfigured or unreachable.',
      );
    } else if (result.limitExceeded) {
      ctx.enrich.notice(
        'Results truncated upstream — some agencies were omitted; this endpoint has no pagination to retrieve the rest.',
      );
    }

    return { agencies: result.agencies, limitExceeded: result.limitExceeded };
  },

  format: (result) => {
    const lines: string[] = [
      `**Agencies:** ${result.agencies.length} | **Limit exceeded:** ${result.limitExceeded}`,
    ];
    if (result.limitExceeded) {
      lines.push('> Results truncated upstream — some agencies omitted (no pagination available).');
    }
    if (result.agencies.length === 0) {
      lines.push('No agencies found.');
      return [{ type: 'text', text: lines.join('\n') }];
    }
    for (const a of result.agencies) {
      lines.push(`## ${a.name}`);
      lines.push(`**ID:** ${a.id} | **Timezone:** ${a.timezone}`);
      lines.push(`**URL:** ${a.url}`);
      lines.push(`**Phone:** ${orNone(a.phone)}`);
      lines.push(
        `**Coverage center:** ${coords(a.coverageCenter.lat, a.coverageCenter.lon)} (±${a.coverageSpan.latSpan}° lat, ±${a.coverageSpan.lonSpan}° lon)`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
