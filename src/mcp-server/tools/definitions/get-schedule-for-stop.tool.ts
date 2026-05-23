/**
 * @fileoverview Full-day departure schedule for a stop.
 * @module mcp-server/tools/definitions/get-schedule-for-stop.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export const getScheduleForStop = tool('onebusaway_get_schedule_for_stop', {
  title: 'Get Stop Schedule',
  description:
    "Full-day departure schedule for a stop. Lists every departure by route and direction for the specified date (defaults to today). Useful for planning or when real-time data isn't needed. For live predictions, use onebusaway_get_arrivals instead.",
  annotations: { readOnlyHint: true },
  input: z.object({
    stopId: z
      .string()
      .min(1)
      .describe(
        'Agency-prefixed stop ID (e.g. "1_75403"). Use onebusaway_find_stops or onebusaway_search_stops to discover IDs.',
      ),
    date: z
      .string()
      .optional()
      .describe('ISO 8601 date (e.g. "2026-05-23"). Defaults to today in the agency\'s timezone.'),
  }),
  output: z.object({
    stopId: z.string().describe('The queried stop ID.'),
    stopName: z.string().describe('Stop name.'),
    serviceDateMs: z.number().describe('Service date as Unix milliseconds (start of service day).'),
    routes: z
      .array(
        z
          .object({
            routeId: z
              .string()
              .describe(
                'Route ID for follow-up onebusaway_get_route or onebusaway_get_schedule_for_route calls.',
              ),
            routeShortName: z.string().describe('Route short name.'),
            directions: z
              .array(
                z
                  .object({
                    tripHeadsign: z.string().describe('Destination sign text.'),
                    departures: z
                      .array(
                        z
                          .object({
                            scheduledDepartureTime: z
                              .number()
                              .describe('Scheduled departure time as Unix milliseconds.'),
                            tripId: z
                              .string()
                              .describe('Trip ID for follow-up onebusaway_get_trip calls.'),
                          })
                          .describe('A single scheduled departure.'),
                      )
                      .describe('All departures for this direction.'),
                  })
                  .describe('A service direction at this stop.'),
              )
              .describe('Service directions for this route at this stop.'),
          })
          .describe('A route with its scheduled departures from this stop.'),
      )
      .describe('All routes with departures from this stop on this date.'),
  }),
  errors: [
    {
      reason: 'stop_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Stop ID does not exist on this instance.',
      recovery:
        'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.',
    },
  ],

  async handler(input, ctx) {
    const result = await getOneBusAwayService().getScheduleForStop(
      {
        stopId: input.stopId,
        ...(input.date && { date: input.date }),
      },
      ctx,
    );
    ctx.log.info('getScheduleForStop completed', {
      stopId: input.stopId,
      routeCount: result.routes.length,
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
      `## Schedule for ${result.stopName} (${result.stopId})`,
      `**Service date:** ${serviceDateStr} (${result.serviceDateMs})`,
      `**Routes:** ${result.routes.length}`,
    ];
    for (const r of result.routes) {
      lines.push(`\n### Route ${r.routeShortName} (${r.routeId})`);
      for (const dir of r.directions) {
        lines.push(`**→ ${dir.tripHeadsign}** (${dir.departures.length} departures)`);
        const times = dir.departures.map(
          (d) => `${fmtTime(d.scheduledDepartureTime)} (${d.scheduledDepartureTime}) [${d.tripId}]`,
        );
        lines.push(times.join(', '));
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
