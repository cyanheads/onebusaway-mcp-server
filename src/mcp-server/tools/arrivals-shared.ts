/**
 * @fileoverview Input schema, arrival output schema, and arrival rendering shared by
 *   onebusaway_get_arrivals and onebusaway_get_stop_context — both are served by the
 *   same arrivals-and-departures-for-stop request, so they take identical inputs and
 *   report arrivals in one shape.
 * @module mcp-server/tools/arrivals-shared
 */

import { z } from '@cyanheads/mcp-ts-core';
import { coordsOrNone, listOrNone, orNone } from '@/mcp-server/tools/format-helpers.js';

/** Upper bound of `minutesAfter` — the widest real-time window one call can request. */
const MINUTES_AFTER_MAX = 240;

/**
 * Stop and time window. The bounds keep the window inside what OneBusAway computes
 * correctly (it binds both to a 32-bit int with no validation, so negatives shift
 * the window and large values overflow) and the response a readable size.
 */
export const arrivalsInput = z.object({
  stopId: z
    .string()
    .min(1)
    .describe(
      'Agency-prefixed stop ID (e.g. "1_75403" for Metro Transit stop 75403). Use onebusaway_find_stops or onebusaway_search_stops to discover IDs.',
    ),
  minutesBefore: z
    .number()
    .int()
    .min(0)
    .max(60)
    .default(5)
    .describe(
      'Include arrivals that departed up to this many minutes ago — an integer from 0 to 60. Defaults to 5.',
    ),
  minutesAfter: z
    .number()
    .int()
    .min(0)
    .max(MINUTES_AFTER_MAX)
    .default(35)
    .describe(
      `Include arrivals expected within the next N minutes — an integer from 0 to ${MINUTES_AFTER_MAX}. Defaults to 35. For a longer horizon, use onebusaway_get_schedule_for_stop.`,
    ),
});

/**
 * Next step for an empty arrivals window. Names `minutesAfter` only while the call
 * can still raise it; at the cap, the schedule tool is the one lever left.
 */
export function emptyWindowAdvice(minutesAfter: number): string {
  const schedule = 'onebusaway_get_schedule_for_stop for scheduled service on this date';
  return minutesAfter < MINUTES_AFTER_MAX
    ? `Try increasing minutesAfter (up to ${MINUTES_AFTER_MAX}), or check ${schedule}.`
    : `${MINUTES_AFTER_MAX} minutes is the widest real-time window — check ${schedule}.`;
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
        'Seconds late (positive) or early (negative). Only meaningful when predicted=true.',
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
      .describe('Number of stops until this stop, or null if unknown.'),
    tripId: z.string().describe('Trip ID for follow-up onebusaway_get_trip calls.'),
    routeId: z.string().describe('Route ID for follow-up route calls.'),
    situationIds: z
      .array(z.string())
      .describe('IDs of active service alerts affecting this arrival.'),
  })
  .describe('A single arrival or departure at this stop.');

type Arrival = z.infer<typeof arrivalSchema>;

/** Format Unix milliseconds as a human-readable HH:MM time string. */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Format schedule deviation (seconds) as a readable label. */
function fmtDeviation(seconds: number): string {
  if (seconds === 0) return 'on time';
  const abs = Math.abs(seconds);
  const mins = Math.round(abs / 60);
  return seconds > 0 ? `${mins} min late` : `${mins} min early`;
}

/** Markdown lines for one arrival, opening with its `### Route …` heading. */
export function renderArrival(a: Arrival): string[] {
  const arrivalTime = a.predictedArrivalTime ?? a.scheduledArrivalTime;
  const devStr = a.predicted ? ` (${fmtDeviation(a.scheduleDeviation)})` : ' (scheduled)';
  const lines = [
    `\n### Route ${a.routeShortName} → ${a.tripHeadsign}`,
    `**Arrives:** ${fmtTime(arrivalTime)}${devStr}`,
    `**Scheduled:** ${fmtTime(a.scheduledArrivalTime)} (${a.scheduledArrivalTime})`,
  ];
  if (a.predictedArrivalTime != null) {
    lines.push(`**Predicted:** ${fmtTime(a.predictedArrivalTime)} (${a.predictedArrivalTime})`);
  }
  lines.push(`**Trip ID:** ${a.tripId} | **Route ID:** ${a.routeId}`);
  if (a.stopsAway != null && a.stopsAway >= 0) {
    lines.push(`**Stops away:** ${a.stopsAway === 0 ? 'At stop' : a.stopsAway}`);
  } else if (a.stopsAway != null && a.stopsAway < 0) {
    lines.push(`**Stops away:** Arrived`);
  }
  lines.push(`**Vehicle:** ${orNone(a.vehicleId)}`);
  lines.push(`**Vehicle position:** ${coordsOrNone(a.vehiclePosition)}`);
  lines.push(`**Alerts:** ${listOrNone(a.situationIds)}`);
  lines.push(`**GPS-tracked:** ${a.predicted}`);
  lines.push(
    `**Schedule deviation:** ${fmtDeviation(a.scheduleDeviation)} (${a.scheduleDeviation}s)`,
  );
  return lines;
}
