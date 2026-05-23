/**
 * @fileoverview Real-time vehicle positions for all active vehicles for an agency.
 * @module mcp-server/tools/definitions/get-vehicles.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

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
  }),
  errors: [
    {
      reason: 'agency_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Agency ID does not exist on this instance.',
      recovery: 'Use onebusaway_list_agencies to get valid agency IDs for this instance.',
    },
  ],

  async handler(input, ctx) {
    const vehicles = await getOneBusAwayService().getVehicles(
      {
        agencyId: input.agencyId,
        ...(input.routeId && input.routeId.length > 0 && { routeId: input.routeId }),
      },
      ctx,
    );
    ctx.log.info('getVehicles completed', { agencyId: input.agencyId, count: vehicles.length });
    return { vehicles };
  },

  format: (result) => {
    if (result.vehicles.length === 0) {
      return [{ type: 'text', text: 'No active vehicles found.' }];
    }
    const lines: string[] = [`**Active vehicles:** ${result.vehicles.length}`];
    for (const v of result.vehicles) {
      lines.push(`\n## Vehicle ${v.vehicleId}`);
      if (v.routeShortName) {
        lines.push(`**Route:** ${v.routeShortName}${v.tripHeadsign ? ` → ${v.tripHeadsign}` : ''}`);
      }
      if (v.routeId) lines.push(`**Route ID:** ${v.routeId}`);
      if (v.tripId) lines.push(`**Trip ID:** ${v.tripId}`);
      lines.push(`**Position:** ${v.position.lat.toFixed(5)}, ${v.position.lon.toFixed(5)}`);
      lines.push(`**Phase:** ${v.phase} | **Predicted:** ${v.predicted}`);
      if (v.scheduleDeviation != null) {
        const devLabel =
          v.scheduleDeviation === 0
            ? 'on time'
            : v.scheduleDeviation > 0
              ? `${Math.round(v.scheduleDeviation / 60)} min late`
              : `${Math.round(Math.abs(v.scheduleDeviation) / 60)} min early`;
        lines.push(`**Schedule deviation:** ${devLabel} (${v.scheduleDeviation}s)`);
      }
      if (v.orientation != null) lines.push(`**Heading:** ${v.orientation}°`);
      if (v.nextStop) lines.push(`**Next stop:** ${v.nextStop}`);
      lines.push(`**Last update (ms):** ${v.lastUpdateTime}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
