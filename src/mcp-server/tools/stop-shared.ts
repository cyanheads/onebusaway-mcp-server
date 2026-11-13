/**
 * @fileoverview Served-route summaries and text rendering for complete stop metadata.
 * @module mcp-server/tools/stop-shared
 */

import { z } from '@cyanheads/mcp-ts-core';
import { coords, listOrNone, orNone } from '@/mcp-server/tools/format-helpers.js';
import type { Stop } from '@/services/onebusaway/types.js';

/** Route metadata available in the stop response's references. */
export const stopRoutesSchema = z
  .array(
    z
      .object({
        id: z.string().describe('Agency-prefixed route ID.'),
        shortName: z.string().describe('Route number or short name.'),
        agencyId: z.string().describe('ID of the route’s agency.'),
      })
      .describe('A reference-backed route summary.'),
  )
  .describe('Available route summaries in the order of routeIds. An ID can lack a summary.');

/** Render every complete-stop field, including IDs without reference metadata. */
export function renderStop(stop: Stop): string[] {
  return [
    `## ${stop.name}`,
    `**ID:** ${stop.id} | **Code:** ${orNone(stop.code)}`,
    `**Direction:** ${orNone(stop.direction)}`,
    `**Coordinates:** ${coords(stop.lat, stop.lon)}`,
    `**Routes:** ${listOrNone(stop.routeIds)}`,
    `**Route details:** ${listOrNone(
      stop.routes.map(
        (route) =>
          `${orNone(route.shortName)} (ID: ${route.id}, agency: ${orNone(route.agencyId)})`,
      ),
      '; ',
    )}`,
    `**Wheelchair:** ${stop.wheelchairBoarding}`,
  ];
}
