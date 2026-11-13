/**
 * @fileoverview Stop details, real-time arrivals, and full service-alert detail for
 *   one stop, served from a single arrivals-and-departures-for-stop request.
 * @module mcp-server/tools/definitions/get-stop-context.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { alertDetailShape, renderAlertDetail } from '@/mcp-server/tools/alert-shared.js';
import {
  applyArrivalWindow,
  arrivalSchema,
  arrivalsInput,
  emptyWindowAdvice,
  fmtTime,
  renderArrival,
} from '@/mcp-server/tools/arrivals-shared.js';
import { coords, orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

export const getStopContext = tool('onebusaway_get_stop_context', {
  title: 'Get Stop Context',
  description:
    'Get stop details, real-time arrivals, and available details for alerts on the stop or its arrivals from one upstream response. Use onebusaway_get_stop for served-route IDs and available route summaries. Pass a raw agency-prefixed stop ID (e.g. "1_75403").',
  annotations: { readOnlyHint: true },
  input: arrivalsInput,
  output: z.object({
    timezone: z
      .string()
      .describe(
        'Validated timezone of the queried stop agency, or UTC when unavailable or invalid.',
      ),
    stop: z
      .object({
        id: z.string().describe('Agency-prefixed stop ID.'),
        code: z.string().describe('The stop code printed on the sign.'),
        name: z.string().describe('Stop name.'),
        lat: z.number().describe('Latitude of the stop.'),
        lon: z.number().describe('Longitude of the stop.'),
        direction: z.string().describe('Compass direction of travel at this stop (e.g. "NW").'),
        wheelchairBoarding: z
          .enum(['ACCESSIBLE', 'NOT_ACCESSIBLE', 'UNKNOWN'])
          .describe('Wheelchair boarding status.'),
      })
      .nullable()
      .describe(
        'The queried stop details. Use onebusaway_get_stop for served routes. Null when the upstream response omitted the stop.',
      ),
    currentTime: z
      .number()
      .describe('Server time as Unix milliseconds, for computing countdown timers.'),
    arrivals: z
      .array(arrivalSchema)
      .describe('Arrivals and departures at this stop within the requested time window.'),
    alerts: z
      .array(z.object(alertDetailShape).describe('One service alert, in full detail.'))
      .describe(
        'Service alerts on this stop or on any arrival in the window, each listed once — including alerts whose affected arrivals fall outside the window.',
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

  enrichment: {
    queriedStop: z.string().describe('Stop ID queried.'),
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
        'Applied input reductions and guidance when arrivals, stop details, or referenced alerts are missing.',
      ),
  },

  enrichmentTrailer: {
    windowMinutes: {
      render: (w) => `**Window:** −${w.before} min / +${w.after} min`,
    },
  },

  async handler(input, ctx) {
    const notices: string[] = [];
    const window = applyArrivalWindow(input, ctx, notices);
    const { unresolvedSituationIds, ...result } = await getOneBusAwayService().getStopContext(
      window,
      ctx,
    );
    ctx.log.info('getStopContext completed', {
      stopId: input.stopId,
      arrivals: result.arrivals.length,
      alerts: result.alerts.length,
    });

    ctx.enrich({
      queriedStop: input.stopId,
      windowMinutes: { before: window.minutesBefore, after: window.minutesAfter },
    });
    if (!result.stop) {
      notices.push(
        `The response carried no details for stop ${input.stopId}, so stop is null — fetch them with onebusaway_get_stop.`,
      );
    }
    if (unresolvedSituationIds.length > 0) {
      notices.push(
        `Alert ID${unresolvedSituationIds.length > 1 ? 's' : ''} ${unresolvedSituationIds.join(', ')} ${unresolvedSituationIds.length > 1 ? 'were' : 'was'} referenced at this stop but missing from the response — fetch with onebusaway_get_alert.`,
      );
    }
    if (result.arrivals.length === 0) {
      notices.push(
        `No arrivals at ${input.stopId} between ${window.minutesBefore} minutes ago and ${window.minutesAfter} minutes from now. ${emptyWindowAdvice(window.minutesAfter)}`,
      );
    }
    if (notices.length > 0) ctx.enrich.notice(notices.join(' '));

    return result;
  },

  format: (result) => {
    const lines: string[] = ['## Stop'];
    const stop = result.stop;
    if (stop) {
      lines.push(`**Name:** ${stop.name}`);
      lines.push(`**ID:** ${stop.id} | **Code:** ${orNone(stop.code)}`);
      lines.push(`**Direction:** ${orNone(stop.direction)}`);
      lines.push(`**Coordinates:** ${coords(stop.lat, stop.lon)}`);
      lines.push(`**Wheelchair:** ${stop.wheelchairBoarding}`);
    } else {
      lines.push('**Stop details:** none');
    }
    lines.push(`**Timezone:** ${result.timezone}`);
    lines.push(
      `**Current time:** ${fmtTime(result.currentTime, result.timezone)} (${result.currentTime})`,
    );

    lines.push(`\n## Arrivals (${result.arrivals.length})`);
    if (result.arrivals.length === 0) lines.push('**Arrivals:** none');
    for (const a of result.arrivals) lines.push(...renderArrival(a, result.timezone));

    lines.push(`\n## Service Alerts (${result.alerts.length})`);
    if (result.alerts.length === 0) lines.push('**Alerts:** none');
    for (const alert of result.alerts) lines.push('', ...renderAlertDetail(alert, '###'));

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
