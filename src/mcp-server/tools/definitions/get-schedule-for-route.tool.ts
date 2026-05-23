/**
 * @fileoverview Full-day schedule for a route — all trips and stop sequences.
 * @module mcp-server/tools/definitions/get-schedule-for-route.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

/** Format seconds-from-midnight (GTFS schedule) as HH:MM. */
function fmtTimeSec(secs: number): string {
  if (!secs && secs !== 0) return 'N/A';
  const h = Math.floor(secs / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}`;
}

export const getScheduleForRoute = tool('onebusaway_get_schedule_for_route', {
  title: 'Get Route Schedule',
  description:
    'Full-day schedule for a route — all trips, stop sequences, and departure times for the specified date (defaults to today). Returns up to all trips for the route. For live predictions, use onebusaway_get_arrivals at specific stops instead.',
  annotations: { readOnlyHint: true },
  input: z.object({
    routeId: z
      .string()
      .min(1)
      .describe(
        'Agency-prefixed route ID (e.g. "1_100259"). Use onebusaway_find_routes or onebusaway_search_routes to discover IDs.',
      ),
    date: z.string().optional().describe('ISO 8601 date (e.g. "2026-05-23"). Defaults to today.'),
  }),
  output: z.object({
    routeId: z.string().describe('The queried route ID.'),
    routeShortName: z.string().describe('Route short name.'),
    serviceDateMs: z.number().describe('Service date as Unix milliseconds.'),
    trips: z
      .array(
        z
          .object({
            tripId: z.string().describe('Trip ID for follow-up onebusaway_get_trip calls.'),
            tripHeadsign: z.string().describe('Destination sign text.'),
            serviceId: z.string().describe('Service calendar ID.'),
            stops: z
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
                  })
                  .describe('A stop time along this trip.'),
              )
              .describe('Stop sequence for this trip.'),
          })
          .describe('A single trip with its scheduled stop sequence.'),
      )
      .describe('All trips for this route on this date, with their stop sequences.'),
  }),
  errors: [
    {
      reason: 'route_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Route ID does not exist on this instance.',
      recovery:
        'Search for the route with onebusaway_find_routes or onebusaway_search_routes to get a valid ID.',
    },
  ],

  async handler(input, ctx) {
    const result = await getOneBusAwayService().getScheduleForRoute(
      {
        routeId: input.routeId,
        ...(input.date && { date: input.date }),
      },
      ctx,
    );
    ctx.log.info('getScheduleForRoute completed', {
      routeId: input.routeId,
      tripCount: result.trips.length,
    });
    return result;
  },

  format: (result) => {
    const serviceDate = new Date(result.serviceDateMs);
    const serviceDateStr = serviceDate.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const lines: string[] = [
      `## Schedule for Route ${result.routeShortName} (${result.routeId})`,
      `**Service date:** ${serviceDateStr} (${result.serviceDateMs})`,
      `**Trips:** ${result.trips.length}`,
    ];
    for (const t of result.trips) {
      lines.push(`\n### Trip ${t.tripId} → ${t.tripHeadsign} (serviceId: ${t.serviceId})`);
      if (t.stops.length > 0) {
        const first = t.stops.at(0);
        const last = t.stops.at(-1);
        if (first && last) {
          lines.push(
            `Departs ${first.stopName} at ${fmtTimeSec(first.departureTime)}, arrives ${last.stopName} at ${fmtTimeSec(last.arrivalTime)} — ${t.stops.length} stops`,
          );
        }
        for (const s of t.stops) {
          lines.push(
            `- ${fmtTimeSec(s.arrivalTime)} [${s.arrivalTime}s] ${s.stopName} (${s.stopId}) dep ${fmtTimeSec(s.departureTime)} [${s.departureTime}s]`,
          );
        }
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
