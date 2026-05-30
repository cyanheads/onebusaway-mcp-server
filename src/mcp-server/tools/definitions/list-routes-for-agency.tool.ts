/**
 * @fileoverview List all routes operated by a specific agency.
 * @module mcp-server/tools/definitions/list-routes-for-agency.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
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
  }),
  errors: [
    {
      reason: 'agency_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Agency ID does not exist on this instance.',
      recovery: 'Use onebusaway_list_agencies to get valid agency IDs for this instance.',
    },
  ],

  // Agent-facing context: agency echo and route count.
  enrichment: {
    agencyId: z.string().describe('Agency ID queried.'),
    count: z.number().describe('Number of routes returned for this agency.'),
  },

  async handler(input, ctx) {
    const routes = await getOneBusAwayService().listRoutesForAgency(input.agencyId, ctx);
    ctx.log.info('listRoutesForAgency completed', {
      agencyId: input.agencyId,
      count: routes.length,
    });

    ctx.enrich({ agencyId: input.agencyId, count: routes.length });

    return { routes };
  },

  format: (result) => {
    if (result.routes.length === 0) {
      return [{ type: 'text', text: 'No routes found for this agency.' }];
    }
    const lines: string[] = [`**Routes:** ${result.routes.length}`];
    for (const r of result.routes) {
      lines.push(`\n## ${r.shortName}${r.longName ? ` — ${r.longName}` : ''}`);
      lines.push(`**ID:** ${r.id} | **Type:** ${r.type}`);
      if (r.description) lines.push(`**Description:** ${r.description}`);
      if (r.color) lines.push(`**Color:** #${r.color}`);
      if (r.url) lines.push(`**Schedule URL:** ${r.url}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
