/**
 * @fileoverview Real-time arrivals and departures at a stop.
 * @module mcp-server/tools/definitions/get-arrivals.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

/** Format Unix milliseconds as a human-readable HH:MM time string. */
function fmtTime(ms: number): string {
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

export const getArrivals = tool('onebusaway_get_arrivals', {
  title: 'Get Real-Time Arrivals',
  description:
    'Real-time arrivals and departures at a stop. Returns predicted arrival times, schedule deviation (how many seconds late/early), vehicle positions, and any active service alerts. The predicted boolean on each arrival indicates whether GPS tracking backs the estimate — predicted=false means schedule-only. Use tripId from results for follow-up onebusaway_get_trip calls. Stop IDs use agency-prefixed format: {agencyId}_{localId} (e.g. "1_75403").',
  annotations: { readOnlyHint: true },
  input: z.object({
    stopId: z
      .string()
      .min(1)
      .describe(
        'Agency-prefixed stop ID (e.g. "1_75403" for Metro Transit stop 75403). Use onebusaway_find_stops or onebusaway_search_stops to discover IDs.',
      ),
    minutesBefore: z
      .number()
      .default(5)
      .describe('Include arrivals that departed up to this many minutes ago. Defaults to 5.'),
    minutesAfter: z
      .number()
      .default(35)
      .describe('Include arrivals expected within the next N minutes. Defaults to 35.'),
  }),
  output: z.object({
    stopId: z.string().describe('The queried stop ID.'),
    stopName: z.string().describe('Stop name.'),
    currentTime: z
      .number()
      .describe('Server time as Unix milliseconds, for computing countdown timers.'),
    arrivals: z
      .array(
        z
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
            scheduledArrivalTime: z
              .number()
              .describe('Scheduled arrival time as Unix milliseconds.'),
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
          .describe('A single arrival or departure at this stop.'),
      )
      .describe('Arrivals and departures at this stop within the requested time window.'),
    situations: z
      .array(
        z
          .object({
            id: z.string().describe('Situation ID.'),
            summary: z.string().describe('Short summary of the service alert.'),
            description: z
              .string()
              .nullable()
              .describe('Longer description of the service alert, or null.'),
          })
          .describe('A single active service alert.'),
      )
      .describe('Active service alerts referenced by arrivals at this stop.'),
  }),
  errors: [
    {
      reason: 'stop_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Stop ID does not exist on this instance.',
      recovery:
        'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.',
    },
    {
      reason: 'rate_limited',
      code: JsonRpcErrorCode.RateLimited,
      retryable: true,
      when: 'API returned a rate limit response.',
      recovery: 'Wait a moment and retry; the Puget Sound instance enforces ~20 req/min per IP.',
    },
  ],

  // Agent-facing context: arrival count, time window echo, and empty-result guidance.
  enrichment: {
    queriedStop: z.string().describe('Stop ID queried.'),
    count: z.number().describe('Number of arrivals in the time window.'),
    windowMinutes: z
      .object({
        before: z.number().describe('Minutes before current time included.'),
        after: z.number().describe('Minutes after current time included.'),
      })
      .describe('Time window used for the arrivals query.'),
    notice: z
      .string()
      .optional()
      .describe(
        'Guidance when no arrivals were found — e.g. try expanding the time window or check for service alerts.',
      ),
  },

  enrichmentTrailer: {
    windowMinutes: {
      render: (w) => `**Window:** −${w.before} min / +${w.after} min`,
    },
  },

  async handler(input, ctx) {
    const result = await getOneBusAwayService().getArrivals(
      {
        stopId: input.stopId,
        minutesBefore: input.minutesBefore,
        minutesAfter: input.minutesAfter,
      },
      ctx,
    );
    ctx.log.info('getArrivals completed', {
      stopId: input.stopId,
      count: result.arrivals.length,
      situations: result.situations.length,
    });

    ctx.enrich({
      queriedStop: input.stopId,
      count: result.arrivals.length,
      windowMinutes: { before: input.minutesBefore, after: input.minutesAfter },
    });
    if (result.arrivals.length === 0) {
      ctx.enrich.notice(
        `No arrivals found at ${input.stopId} within the next ${input.minutesAfter} minutes. Try increasing minutesAfter, or check onebusaway_get_schedule_for_stop for scheduled service on this date.`,
      );
    }

    return result;
  },

  format: (result) => {
    const lines: string[] = [
      `## Arrivals at ${result.stopName} (${result.stopId})`,
      `**Current time:** ${fmtTime(result.currentTime)} (${result.currentTime})`,
      `**Arrivals:** ${result.arrivals.length}`,
    ];

    if (result.arrivals.length === 0) {
      lines.push('\n_No arrivals in the requested time window._');
    } else {
      for (const a of result.arrivals) {
        const arrivalTime = a.predictedArrivalTime ?? a.scheduledArrivalTime;
        const timeStr = fmtTime(arrivalTime);
        const devStr = a.predicted ? ` (${fmtDeviation(a.scheduleDeviation)})` : ' (scheduled)';
        lines.push(`\n### Route ${a.routeShortName} → ${a.tripHeadsign}`);
        lines.push(`**Arrives:** ${timeStr}${devStr}`);
        lines.push(`**Scheduled:** ${fmtTime(a.scheduledArrivalTime)} (${a.scheduledArrivalTime})`);
        if (a.predictedArrivalTime != null) {
          lines.push(
            `**Predicted:** ${fmtTime(a.predictedArrivalTime)} (${a.predictedArrivalTime})`,
          );
        }
        lines.push(`**Trip ID:** ${a.tripId} | **Route ID:** ${a.routeId}`);
        if (a.stopsAway != null && a.stopsAway >= 0) {
          lines.push(`**Stops away:** ${a.stopsAway === 0 ? 'At stop' : a.stopsAway}`);
        } else if (a.stopsAway != null && a.stopsAway < 0) {
          lines.push(`**Stops away:** Arrived`);
        }
        if (a.vehicleId) lines.push(`**Vehicle:** ${a.vehicleId}`);
        if (a.vehiclePosition) {
          lines.push(
            `**Vehicle position:** ${a.vehiclePosition.lat.toFixed(5)}, ${a.vehiclePosition.lon.toFixed(5)}`,
          );
        }
        if (a.situationIds.length > 0) {
          lines.push(`**Alerts:** ${a.situationIds.join(', ')}`);
        }
        lines.push(`**GPS-tracked:** ${a.predicted}`);
        lines.push(
          `**Schedule deviation:** ${fmtDeviation(a.scheduleDeviation)} (${a.scheduleDeviation}s)`,
        );
      }
    }

    if (result.situations.length > 0) {
      lines.push('\n## Service Alerts');
      for (const s of result.situations) {
        lines.push(`\n### ${s.summary} (${s.id})`);
        if (s.description) lines.push(s.description);
      }
    }

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
