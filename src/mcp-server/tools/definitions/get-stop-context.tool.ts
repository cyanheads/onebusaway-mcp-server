/**
 * @fileoverview Stop details, real-time arrivals, and full service-alert detail for
 *   one stop, served from a single arrivals-and-departures-for-stop request.
 * @module mcp-server/tools/definitions/get-stop-context.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { alertDetailShape, renderAlertDetail } from '@/mcp-server/tools/alert-shared.js';
import {
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
    'Everything happening at a stop in one call: the stop\'s details, its real-time arrivals, and full detail for every service alert on the stop or on any arrival in the window. Returns what onebusaway_get_stop, onebusaway_get_arrivals, and one onebusaway_get_alert call per alert would, from a single upstream request — arrivals in the onebusaway_get_arrivals shape, alerts in the onebusaway_get_alert shape. The stop omits its served-route list; use onebusaway_get_stop for routeIds. Stop IDs use agency-prefixed format: {agencyId}_{localId} (e.g. "1_75403").',
  annotations: { readOnlyHint: true },
  input: arrivalsInput,
  output: z.object({
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
        'The queried stop, without its served-route list (use onebusaway_get_stop for routeIds). Null when the upstream response omitted the stop.',
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
        'What the response is missing and where to get it — no arrivals in the window, stop details absent, or referenced alerts absent.',
      ),
  },

  enrichmentTrailer: {
    windowMinutes: {
      render: (w) => `**Window:** −${w.before} min / +${w.after} min`,
    },
  },

  async handler(input, ctx) {
    const { unresolvedSituationIds, ...result } = await getOneBusAwayService().getStopContext(
      {
        stopId: input.stopId,
        minutesBefore: input.minutesBefore,
        minutesAfter: input.minutesAfter,
      },
      ctx,
    );
    ctx.log.info('getStopContext completed', {
      stopId: input.stopId,
      arrivals: result.arrivals.length,
      alerts: result.alerts.length,
    });

    ctx.enrich({
      queriedStop: input.stopId,
      windowMinutes: { before: input.minutesBefore, after: input.minutesAfter },
    });
    const notices: string[] = [];
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
        `No arrivals at ${input.stopId} between ${input.minutesBefore} minutes ago and ${input.minutesAfter} minutes from now. ${emptyWindowAdvice(input.minutesAfter)}`,
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
    lines.push(`**Current time:** ${fmtTime(result.currentTime)} (${result.currentTime})`);

    lines.push(`\n## Arrivals (${result.arrivals.length})`);
    if (result.arrivals.length === 0) lines.push('**Arrivals:** none');
    for (const a of result.arrivals) lines.push(...renderArrival(a));

    lines.push(`\n## Service Alerts (${result.alerts.length})`);
    if (result.alerts.length === 0) lines.push('**Alerts:** none');
    for (const alert of result.alerts) lines.push('', ...renderAlertDetail(alert, '###'));

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
