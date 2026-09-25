/**
 * @fileoverview Real-time arrivals and departures at a stop.
 * @module mcp-server/tools/definitions/get-arrivals.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import {
  arrivalSchema,
  arrivalsInput,
  emptyWindowAdvice,
  fmtTime,
  renderArrival,
} from '@/mcp-server/tools/arrivals-shared.js';
import { orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const getArrivals = tool('onebusaway_get_arrivals', {
  title: 'Get Real-Time Arrivals',
  description:
    'Real-time arrivals and departures at a stop. Returns predicted arrival times, schedule deviation (how many seconds late/early), vehicle positions, and any active service alerts. The predicted boolean on each arrival indicates whether GPS tracking backs the estimate — predicted=false means schedule-only. Use tripId from results for follow-up onebusaway_get_trip calls. Stop IDs use agency-prefixed format: {agencyId}_{localId} (e.g. "1_75403").',
  annotations: { readOnlyHint: true },
  input: arrivalsInput,
  output: z.object({
    stopId: z.string().describe('The queried stop ID.'),
    stopName: z.string().describe('Stop name.'),
    currentTime: z
      .number()
      .describe('Server time as Unix milliseconds, for computing countdown timers.'),
    arrivals: z
      .array(arrivalSchema)
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
      .describe(
        'Active service alerts at this stop — those attached to the stop itself and those referenced by its arrivals, each listed once.',
      ),
  }),
  errors: [
    {
      reason: 'stop_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Stop ID does not exist on this instance.',
      recovery:
        'Search for the stop with onebusaway_find_stops or onebusaway_search_stops to get a valid ID.',
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
        'Guidance when no arrivals were found — widen minutesAfter, or check onebusaway_get_schedule_for_stop for scheduled service.',
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
        `No arrivals found at ${input.stopId} within the next ${input.minutesAfter} minutes. ${emptyWindowAdvice(input.minutesAfter)}`,
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
      for (const a of result.arrivals) lines.push(...renderArrival(a));
    }

    if (result.situations.length > 0) {
      lines.push('\n## Service Alerts');
      for (const s of result.situations) {
        lines.push(`\n### ${s.summary} (${s.id})`);
        lines.push(`**Description:** ${orNone(s.description)}`);
      }
    }

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
