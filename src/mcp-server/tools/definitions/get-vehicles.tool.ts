/**
 * @fileoverview Real-time vehicle positions for all active vehicles for an agency.
 * @module mcp-server/tools/definitions/get-vehicles.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { coords, EMPTY, orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

/** Format Unix milliseconds as HH:MM. */
function fmtTime(ms: number): string {
  if (!ms && ms !== 0) return 'N/A';
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export const getVehicles = tool('onebusaway_get_vehicles', {
  title: 'Get Real-Time Vehicle Positions',
  description:
    'Real-time positions of all active vehicles for an agency. Optionally filter to a single route (client-side). Returns GPS coordinates, heading, schedule deviation, and current trip. Useful for "where are all the buses on route X right now?" Use agencyId values from onebusaway_list_agencies.',
  annotations: { readOnlyHint: true },
  input: z.object({
    agencyId: z
      .string()
      .min(1)
      .describe(
        'Agency ID (e.g. "1" for Metro Transit, "40" for Sound Transit). Use onebusaway_list_agencies to discover IDs.',
      ),
    routeId: z
      .string()
      .optional()
      .describe(
        'Optional agency-prefixed route ID to filter results to one route. Filtering is client-side — all agency vehicles are fetched first.',
      ),
  }),
  output: z.object({
    vehicles: z
      .array(
        z
          .object({
            vehicleId: z.string().describe('Vehicle ID.'),
            tripId: z.string().nullable().describe('Current trip ID, or null if not on a trip.'),
            routeId: z.string().nullable().describe('Current route ID, or null.'),
            routeShortName: z.string().nullable().describe('Route short name, or null.'),
            tripHeadsign: z.string().nullable().describe('Destination sign text, or null.'),
            position: z
              .object({
                lat: z.number().describe('Vehicle latitude.'),
                lon: z.number().describe('Vehicle longitude.'),
              })
              .describe('Current GPS position.'),
            lastUpdateTime: z
              .number()
              .describe('Timestamp of the last position update as Unix milliseconds.'),
            phase: z
              .string()
              .describe('Current journey phase (e.g. "in_progress", "layover_before").'),
            scheduleDeviation: z
              .number()
              .nullable()
              .describe('Seconds late (positive) or early (negative), or null.'),
            orientation: z
              .number()
              .nullable()
              .describe('Heading in degrees (0=north, 90=east), or null.'),
            nextStop: z.string().nullable().describe('Stop ID of the next stop, or null.'),
            predicted: z
              .boolean()
              .describe('True if this vehicle is reporting real-time GPS data.'),
          })
          .describe('A real-time vehicle position entry.'),
      )
      .describe('Active vehicles for the agency, optionally filtered by route.'),
    limitExceeded: z
      .boolean()
      .describe(
        'True if the upstream capped the vehicle list — some vehicles were omitted. This endpoint has no pagination to retrieve them.',
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

  // Agent-facing context: agency/route echo, count, and empty-result guidance.
  enrichment: {
    agencyId: z.string().describe('Agency ID queried.'),
    routeId: z.string().optional().describe('Route ID filter applied client-side, if any.'),
    count: z.number().describe('Number of vehicles returned after any route filter.'),
    notice: z
      .string()
      .optional()
      .describe(
        'Guidance when no vehicles were found — e.g. the route may not be currently active, or the agency may not have real-time data.',
      ),
  },

  async handler(input, ctx) {
    const result = await getOneBusAwayService().getVehicles(
      {
        agencyId: input.agencyId,
        ...(input.routeId && { routeId: input.routeId }),
      },
      ctx,
    );
    ctx.log.info('getVehicles completed', {
      agencyId: input.agencyId,
      count: result.vehicles.length,
      limitExceeded: result.limitExceeded,
    });

    ctx.enrich({
      agencyId: input.agencyId,
      ...(input.routeId && { routeId: input.routeId }),
      count: result.vehicles.length,
    });
    if (result.vehicles.length === 0) {
      ctx.enrich.notice(
        input.routeId
          ? `No active vehicles found on route ${input.routeId}. The route may not be currently running or may not have real-time data.`
          : `No active vehicles found for agency ${input.agencyId}. Vehicles may not be running at this time.`,
      );
    } else if (result.limitExceeded) {
      ctx.enrich.notice(
        'Results truncated upstream — some active vehicles were omitted; this endpoint has no pagination to retrieve the rest.',
      );
    }

    return { vehicles: result.vehicles, limitExceeded: result.limitExceeded };
  },

  format: (result) => {
    const lines: string[] = [
      `**Active vehicles:** ${result.vehicles.length} | **Limit exceeded:** ${result.limitExceeded}`,
    ];
    if (result.limitExceeded) {
      lines.push('> Results truncated upstream — some vehicles omitted (no pagination available).');
    }
    if (result.vehicles.length === 0) {
      lines.push('No active vehicles found.');
      return [{ type: 'text', text: lines.join('\n') }];
    }
    for (const v of result.vehicles) {
      lines.push(`\n## Vehicle ${v.vehicleId}`);
      lines.push(
        `**Route:** ${orNone(v.routeShortName)}${v.tripHeadsign ? ` → ${v.tripHeadsign}` : ''}`,
      );
      lines.push(`**Route ID:** ${orNone(v.routeId)}`);
      lines.push(`**Trip ID:** ${orNone(v.tripId)}`);
      lines.push(`**Position:** ${coords(v.position.lat, v.position.lon)}`);
      lines.push(`**Phase:** ${v.phase} | **Predicted:** ${v.predicted}`);
      if (v.scheduleDeviation == null) {
        lines.push(`**Schedule deviation:** ${EMPTY}`);
      } else {
        const devLabel =
          v.scheduleDeviation === 0
            ? 'on time'
            : v.scheduleDeviation > 0
              ? `${Math.round(v.scheduleDeviation / 60)} min late`
              : `${Math.round(Math.abs(v.scheduleDeviation) / 60)} min early`;
        lines.push(`**Schedule deviation:** ${devLabel} (${v.scheduleDeviation}s)`);
      }
      lines.push(`**Heading:** ${orNone(v.orientation, (o) => `${o}°`)}`);
      lines.push(`**Next stop:** ${orNone(v.nextStop)}`);
      lines.push(`**Last update:** ${fmtTime(v.lastUpdateTime)} (${v.lastUpdateTime})`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
