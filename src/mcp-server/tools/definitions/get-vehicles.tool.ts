/**
 * @fileoverview Real-time vehicle positions for all active vehicles for an agency.
 * @module mcp-server/tools/definitions/get-vehicles.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { coords, EMPTY, formatEpoch, orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const getVehicles = tool('onebusaway_get_vehicles', {
  title: 'Get Real-Time Vehicle Positions',
  description:
    'Real-time positions of active vehicles for an agency. Optionally filter to a single route (client-side). Returns GPS coordinates, counter-clockwise orientation from east, schedule deviation, and current trip. Reports agency records omitted for missing position coordinates. Use agencyId values from onebusaway_list_agencies.',
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
    timezone: z
      .string()
      .describe('Validated timezone of the requested agency, or UTC when unavailable or invalid.'),
    omittedWithoutPosition: z
      .number()
      .describe(
        'Agency-wide records omitted because latitude or longitude is missing, counted before route filtering.',
      ),
    omittedWithoutPositionOnRoute: z
      .number()
      .optional()
      .describe(
        'Omitted records whose canonical current trip resolves to the requested route; present only with a route filter.',
      ),
    vehicles: z
      .array(
        z
          .object({
            vehicleId: z.string().describe('Vehicle ID.'),
            tripId: z
              .string()
              .nullable()
              .describe(
                'Active trip ID, falling back to the vehicle trip ID when absent; null if neither is available. All trip metadata resolves only from this ID.',
              ),
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
              .describe(
                'Counter-clockwise degrees from east (0=east, 90=north, 180=west, 270=south), not a compass bearing; null if unavailable.',
              ),
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
        'Independent notices for records omitted without position, upstream truncation, and an empty returned list.',
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
    const notices: string[] = [];
    if (result.omittedWithoutPosition > 0) {
      notices.push(
        `${result.omittedWithoutPosition} agency records omitted without position coordinates.`,
      );
    }
    if (result.limitExceeded) {
      notices.push(
        'Results truncated upstream — some active vehicles were omitted; this endpoint has no pagination to retrieve the rest.',
      );
    }
    if (result.vehicles.length === 0) {
      notices.push(
        input.routeId
          ? `No active vehicles found on route ${input.routeId}. The route may not be currently running or may not have real-time data.`
          : `No active vehicles found for agency ${input.agencyId}. Vehicles may not be running at this time.`,
      );
    }
    if (notices.length) ctx.enrich.notice(notices.join(' '));

    return result;
  },

  format: (result) => {
    const lines: string[] = [
      `**Timezone:** ${result.timezone}`,
      `**Active vehicles:** ${result.vehicles.length} | **Limit exceeded:** ${result.limitExceeded}`,
      `**Omitted without position (agency):** ${result.omittedWithoutPosition}`,
    ];
    if (result.omittedWithoutPositionOnRoute !== undefined) {
      lines.push(`**Omitted without position (route):** ${result.omittedWithoutPositionOnRoute}`);
    }
    if (result.omittedWithoutPosition > 0) {
      lines.push('> Records without latitude or longitude are omitted from positions.');
    }
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
      lines.push(
        `**Orientation (0=east, counter-clockwise):** ${orNone(v.orientation, (o) => `${o}°`)}`,
      );
      lines.push(`**Next stop:** ${orNone(v.nextStop)}`);
      lines.push(
        `**Last update:** ${formatEpoch(v.lastUpdateTime, result.timezone)} (${v.lastUpdateTime})`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
