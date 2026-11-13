/**
 * @fileoverview Input schema, arrival output schema, and arrival rendering shared by
 *   onebusaway_get_arrivals and onebusaway_get_stop_context — both are served by the
 *   same arrivals-and-departures-for-stop request, so they take identical inputs and
 *   report arrivals in one shape.
 * @module mcp-server/tools/arrivals-shared
 */

import { type Context, z } from '@cyanheads/mcp-ts-core';
import {
  coordsOrNone,
  formatEpoch,
  listOrNone,
  orNone,
} from '@/mcp-server/tools/format-helpers.js';
import { applyReadLimit, readCaps, readLimit } from '@/mcp-server/tools/read-limits.js';
import { oneBusAwayIdSchema } from '@/services/onebusaway/identifier.js';

/**
 * Stop and time window. The bounds keep the window inside what OneBusAway computes
 * correctly (it binds both to a 32-bit int with no validation, so negatives shift
 * the window and large values overflow) and the response a readable size.
 */
export const arrivalsInput = z.object({
  stopId: oneBusAwayIdSchema.describe(
    'Agency-prefixed stop ID (e.g. "1_75403" for Metro Transit stop 75403). Use onebusaway_find_stops or onebusaway_search_stops to discover IDs.',
  ),
  minutesBefore: readLimit(
    z.number().min(0),
    readCaps.minutesBefore,
    5,
    `Include arrivals that departed up to this many minutes ago. Nonnegative integer, default 5, applied cap ${readCaps.minutesBefore}.`,
    true,
  ),
  minutesAfter: readLimit(
    z.number().min(0),
    readCaps.minutesAfter,
    35,
    `Include arrivals expected within the next N minutes. Nonnegative integer, default 35, applied cap ${readCaps.minutesAfter}. For a longer horizon, use onebusaway_get_schedule_for_stop.`,
    true,
  ),
});

/** Apply both limits before dispatch and before reporting the queried window. */
export function applyArrivalWindow(
  input: z.output<typeof arrivalsInput>,
  ctx: Pick<Context, 'log'>,
  notices: string[],
) {
  return {
    stopId: input.stopId,
    minutesBefore: applyReadLimit(
      'minutesBefore',
      input.minutesBefore,
      readCaps.minutesBefore,
      ctx,
      notices,
    ),
    minutesAfter: applyReadLimit(
      'minutesAfter',
      input.minutesAfter,
      readCaps.minutesAfter,
      ctx,
      notices,
    ),
  };
}

/**
 * Next step for an empty arrivals window. Names `minutesAfter` only while the call
 * can still raise it; at the cap, the schedule tool is the one lever left.
 */
export function emptyWindowAdvice(minutesAfter: number): string {
  const schedule = 'onebusaway_get_schedule_for_stop for scheduled service on this date';
  return minutesAfter < readCaps.minutesAfter
    ? `Try increasing minutesAfter (up to ${readCaps.minutesAfter}), or check ${schedule}.`
    : `${readCaps.minutesAfter} minutes is the widest real-time window — check ${schedule}.`;
}

/** One arrival or departure at the queried stop. */
export const arrivalSchema = z
  .object({
    routeShortName: z.string().describe('Route short name (e.g. "44").'),
    tripHeadsign: z.string().describe('Destination sign text (e.g. "Downtown Seattle").'),
    predicted: z
      .boolean()
      .describe('True if GPS-tracked real-time data is available; false if schedule-only.'),
    predictedArrivalTime: z
      .number()
      .nullable()
      .describe('Predicted arrival time as Unix milliseconds. Null when predicted=false.'),
    scheduledArrivalTime: z.number().describe('Scheduled arrival time as Unix milliseconds.'),
    scheduleDeviation: z
      .number()
      .describe(
        'Current vehicle schedule deviation in seconds, late if positive and early if negative. Interpret when predicted=true. Compare predictedArrivalTime with scheduledArrivalTime for deviation at the queried stop.',
      ),
    vehicleId: z.string().nullable().describe('Vehicle ID if known, or null.'),
    vehiclePosition: z
      .object({
        lat: z.number().describe('Vehicle latitude.'),
        lon: z.number().describe('Vehicle longitude.'),
      })
      .nullable()
      .describe('Current vehicle position if available, or null.'),
    stopsAway: z
      .number()
      .nullable()
      .describe(
        'Queried stop block sequence minus the next stop block sequence, or null when absent. Upstream can also report 0 when unavailable.',
      ),
    tripId: z.string().describe('Trip ID for follow-up onebusaway_get_trip calls.'),
    routeId: z.string().describe('Route ID for follow-up route calls.'),
    situationIds: z
      .array(z.string())
      .describe('IDs of active service alerts affecting this arrival.'),
  })
  .describe('A single arrival or departure at this stop.');

type Arrival = z.infer<typeof arrivalSchema>;

/** Format Unix milliseconds as a human-readable HH:MM time string. */
export function fmtTime(ms: number, timezone: string): string {
  return formatEpoch(ms, timezone);
}

/** Format schedule deviation (seconds) as a readable label. */
function fmtDeviation(seconds: number): string {
  if (seconds === 0) return 'on time';
  const abs = Math.abs(seconds);
  const mins = Math.round(abs / 60);
  return seconds > 0 ? `${mins} min late` : `${mins} min early`;
}

/** Markdown lines for one arrival, opening with its `### Route …` heading. */
export function renderArrival(a: Arrival, timezone: string): string[] {
  const arrivalTime = a.predictedArrivalTime ?? a.scheduledArrivalTime;
  const lines = [
    `\n### Route ${a.routeShortName} → ${a.tripHeadsign}`,
    `**Arrives:** ${fmtTime(arrivalTime, timezone)}${a.predictedArrivalTime == null ? ' (scheduled)' : ''}`,
    `**Scheduled:** ${fmtTime(a.scheduledArrivalTime, timezone)} (${a.scheduledArrivalTime})`,
  ];
  if (a.predictedArrivalTime == null) {
    lines.push('**Predicted:** none');
  } else {
    const seconds = (a.predictedArrivalTime - a.scheduledArrivalTime) / 1000;
    lines.push(
      `**Predicted:** ${fmtTime(a.predictedArrivalTime, timezone)} (${a.predictedArrivalTime})`,
      `**Predicted arrival deviation:** ${fmtDeviation(seconds)} (${seconds}s)`,
    );
  }
  lines.push(`**Trip ID:** ${a.tripId} | **Route ID:** ${a.routeId}`);
  lines.push(
    `**Block stop sequence offset:** ${orNone(a.stopsAway)}${a.stopsAway === 0 ? ' (may be unavailable)' : ''}`,
  );
  lines.push(`**Vehicle:** ${orNone(a.vehicleId)}`);
  lines.push(`**Vehicle position:** ${coordsOrNone(a.vehiclePosition)}`);
  lines.push(`**Alerts:** ${listOrNone(a.situationIds)}`);
  lines.push(`**GPS-tracked:** ${a.predicted}`);
  lines.push(
    `**Current vehicle deviation:** ${fmtDeviation(a.scheduleDeviation)} (${a.scheduleDeviation}s)`,
  );
  return lines;
}
