/**
 * @fileoverview Real-time status and stop sequence for an active trip.
 * @module mcp-server/tools/definitions/get-trip.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { coordsOrNone, formatEpoch, orNone } from '@/mcp-server/tools/format-helpers.js';
import { oneBusAwayIdSchema } from '@/services/onebusaway/identifier.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

/** Format seconds-from-midnight (GTFS schedule) as HH:MM. */
function fmtTimeSec(secs: number): string {
  const h = Math.floor(secs / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}`;
}

export const getTrip = tool('onebusaway_get_trip', {
  title: 'Get Trip Status',
  description:
    'Get the requested trip’s stop sequence and the vehicle status reported for its block. The status may describe a different active trip in the same block. Use the raw tripId from onebusaway_get_arrivals or a schedule lookup.',
  annotations: { readOnlyHint: true },
  input: z.object({
    tripId: oneBusAwayIdSchema.describe(
      'Raw trip ID from an arrivals response or schedule lookup.',
    ),
    serviceDateMs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Service date as Unix milliseconds (midnight local time) — a non-negative integer. Only needed for trips from a previous service day. Omit to use today.',
      ),
    includeSchedule: z
      .boolean()
      .default(true)
      .describe('Whether to include the full stop sequence with times. Defaults to true.'),
  }),
  output: z.object({
    timezone: z
      .string()
      .describe('Validated timezone of the trip route agency, or UTC when unavailable or invalid.'),
    tripId: z.string().describe('The queried trip ID.'),
    routeShortName: z.string().describe('Route short name (e.g. "44").'),
    tripHeadsign: z.string().describe('Destination sign text.'),
    blockId: z
      .string()
      .nullable()
      .describe(
        'Block ID grouping this trip with the others the same vehicle runs back-to-back. Pass to onebusaway_get_block for the full block schedule. Null when the trip has no block.',
      ),
    status: z
      .object({
        activeTripId: z
          .string()
          .nullable()
          .describe('Trip ID described by this vehicle status, or null when unavailable.'),
        blockTripSequence: z
          .number()
          .nullable()
          .describe('Sequence of the active trip within the block, or null when unavailable.'),
        phase: z
          .string()
          .describe(
            'Current journey phase (e.g. "in_progress", "layover_before", "layover_during").',
          ),
        predicted: z.boolean().describe('True if GPS-tracked real-time data is available.'),
        position: z
          .object({
            lat: z.number().describe('Vehicle latitude.'),
            lon: z.number().describe('Vehicle longitude.'),
          })
          .nullable()
          .describe('Current vehicle position if available, or null.'),
        scheduleDeviation: z.number().describe('Seconds late (positive) or early (negative).'),
        nextStop: z.string().nullable().describe('Stop ID of the next stop, or null.'),
        closestStop: z.string().nullable().describe('Stop ID of the closest stop, or null.'),
        vehicleId: z.string().nullable().describe('Vehicle ID if known, or null.'),
        lastUpdateTime: z
          .number()
          .describe('Timestamp of the last real-time update as Unix milliseconds.'),
      })
      .describe('Real-time vehicle status attributed to activeTripId when available.'),
    schedule: z
      .array(
        z
          .object({
            stopId: z.string().describe('Stop ID.'),
            stopName: z.string().describe('Stop name.'),
            arrivalTime: z
              .number()
              .describe('Scheduled arrival time as seconds from midnight (GTFS format).'),
            departureTime: z
              .number()
              .describe('Scheduled departure time as seconds from midnight (GTFS format).'),
            distanceAlongTripMeters: z
              .number()
              .describe('Distance along the trip to this stop, in meters.'),
          })
          .describe('A scheduled stop time along this trip.'),
      )
      .nullable()
      .describe(
        'Full stop sequence with times for the requested trip, or null if includeSchedule=false.',
      ),
    situations: z.array(z.string()).describe('Active situation IDs affecting this trip.'),
  }),
  errors: [
    {
      reason: 'trip_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Trip ID not found or not active for the service date.',
      recovery:
        'Verify the tripId from an arrivals response; if the trip has completed, fetch the schedule instead with onebusaway_get_schedule_for_route.',
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

  enrichment: {
    notice: z
      .string()
      .optional()
      .describe(
        'Attribution when the vehicle status describes another trip or its trip ID is unavailable.',
      ),
  },

  async handler(input, ctx) {
    const result = await getOneBusAwayService().getTrip(
      {
        tripId: input.tripId,
        ...(input.serviceDateMs != null && { serviceDate: input.serviceDateMs }),
        includeSchedule: input.includeSchedule,
      },
      ctx,
    );
    ctx.log.info('getTrip completed', { tripId: input.tripId });
    const activeTripId = result.status.activeTripId;
    if (activeTripId === null) {
      ctx.enrich.notice('OneBusAway did not identify the trip described by this vehicle status.');
    } else if (activeTripId !== result.tripId) {
      ctx.enrich.notice(
        `Vehicle status describes active trip ${activeTripId}. The requested trip is ${result.tripId}.`,
      );
    }
    return result;
  },

  format: (result) => {
    const s = result.status;
    const devSecs = s.scheduleDeviation;
    const devLabel =
      devSecs === 0
        ? 'on time'
        : devSecs > 0
          ? `${Math.round(devSecs / 60)} min late`
          : `${Math.round(Math.abs(devSecs) / 60)} min early`;

    const lines: string[] = [
      `## Route ${result.routeShortName} → ${result.tripHeadsign}`,
      `**Trip ID:** ${result.tripId}`,
      `**Timezone:** ${result.timezone}`,
      '\n## Vehicle status',
      `**Active trip ID:** ${orNone(s.activeTripId)}`,
      `**Block trip sequence:** ${orNone(s.blockTripSequence)}`,
      `**Phase:** ${s.phase} | **Predicted:** ${s.predicted}`,
      `**Schedule deviation:** ${devLabel} (${s.scheduleDeviation}s)`,
    ];

    lines.push(`**Block:** ${orNone(result.blockId)}`);
    lines.push(`**Vehicle:** ${orNone(s.vehicleId)}`);
    lines.push(`**Position:** ${coordsOrNone(s.position)}`);
    lines.push(`**Next stop:** ${orNone(s.nextStop)}`);
    lines.push(`**Closest stop:** ${orNone(s.closestStop)}`);
    lines.push(
      `**Last update:** ${formatEpoch(s.lastUpdateTime, result.timezone)} (${s.lastUpdateTime})`,
    );

    if (result.situations.length > 0) {
      lines.push(`**Active alerts:** ${result.situations.join(', ')}`);
    }

    if (result.schedule && result.schedule.length > 0) {
      lines.push(`\n## Stop Sequence for ${result.tripId}`);
      for (const st of result.schedule) {
        lines.push(
          `- **${st.stopName}** (${st.stopId}) — arr ${fmtTimeSec(st.arrivalTime)} [${st.arrivalTime}s], dep ${fmtTimeSec(st.departureTime)} [${st.departureTime}s] | dist ${st.distanceAlongTripMeters}m`,
        );
      }
    } else {
      lines.push('**Schedule:** none');
    }

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
