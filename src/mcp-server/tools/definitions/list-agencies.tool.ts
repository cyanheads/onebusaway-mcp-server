/**
 * @fileoverview List all transit agencies on this OneBusAway instance.
 * @module mcp-server/tools/definitions/list-agencies.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
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
  }),

  async handler(_input, ctx) {
    const agencies = await getOneBusAwayService().listAgencies(ctx);
    ctx.log.info('listAgencies completed', { count: agencies.length });
    return { agencies };
  },

  format: (result) => {
    if (result.agencies.length === 0) {
      return [{ type: 'text', text: 'No agencies found.' }];
    }
    const lines: string[] = [];
    for (const a of result.agencies) {
      lines.push(`## ${a.name}`);
      lines.push(`**ID:** ${a.id} | **Timezone:** ${a.timezone}`);
      lines.push(`**URL:** ${a.url}`);
      if (a.phone) lines.push(`**Phone:** ${a.phone}`);
      lines.push(
        `**Coverage center:** ${a.coverageCenter.lat.toFixed(4)}, ${a.coverageCenter.lon.toFixed(4)} (±${a.coverageSpan.latSpan.toFixed(3)}° lat, ±${a.coverageSpan.lonSpan.toFixed(3)}° lon)`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
