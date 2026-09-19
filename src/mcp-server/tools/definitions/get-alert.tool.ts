/**
 * @fileoverview Fetch full detail for a service alert by situation ID.
 * @module mcp-server/tools/definitions/get-alert.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { listOrNone, orNone } from '@/mcp-server/tools/format-helpers.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

/** Format Unix milliseconds as a readable date-time string. */
function fmtMs(ms: number | undefined): string {
  if (ms == null) return 'N/A';
  return new Date(ms).toLocaleString();
}

export const getAlert = tool('onebusaway_get_alert', {
  title: 'Get Service Alert Detail',
  description:
    'Fetch full detail for a service alert (situation) by ID. Returns the summary, description, reason (e.g. detour, construction), affected stops and routes, consequence description, and active time windows. Situation IDs appear in onebusaway_get_arrivals responses under situationIds and situations[].id.',
  annotations: { readOnlyHint: true },
  input: z.object({
    situationId: z
      .string()
      .min(1)
      .describe(
        'Situation/alert ID from onebusaway_get_arrivals (situations[].id or arrivals[].situationIds[]).',
      ),
  }),
  output: z.object({
    id: z.string().describe('Situation ID.'),
    summary: z.string().describe('Short summary of the service alert.'),
    description: z.string().nullable().describe('Longer description of the alert, or null.'),
    reason: z
      .string()
      .nullable()
      .describe(
        'Reason code from TPEG: equipmentReason, environmentReason, personnelReason, miscellaneousReason, securityAlert. Null when not provided.',
      ),
    severity: z.string().nullable().describe('Severity level as reported by the agency, or null.'),
    consequenceMessage: z
      .string()
      .nullable()
      .describe('Human-readable consequence description (e.g. "Detour in effect"), or null.'),
    affects: z
      .array(
        z
          .object({
            agencyId: z.string().optional().describe('Affected agency ID, if scoped to an agency.'),
            routeId: z.string().optional().describe('Affected route ID, if scoped to a route.'),
            stopId: z.string().optional().describe('Affected stop ID, if scoped to a stop.'),
            tripId: z.string().optional().describe('Affected trip ID, if scoped to a trip.'),
          })
          .describe('An entity affected by this alert.'),
      )
      .describe('Stops, routes, trips, or agencies affected by this alert.'),
    consequences: z
      .array(
        z
          .object({
            condition: z
              .string()
              .optional()
              .describe('Consequence condition (e.g. "detour", "reducedService").'),
            diversionStopIds: z
              .array(z.string())
              .optional()
              .describe('Stop IDs on the diversion path, when condition is "detour".'),
          })
          .describe('A consequence of this alert.'),
      )
      .describe('Operational consequences of this alert.'),
    activeWindows: z
      .array(
        z
          .object({
            from: z
              .number()
              .optional()
              .describe('Start of active window as Unix milliseconds, if known.'),
            to: z
              .number()
              .optional()
              .describe('End of active window as Unix milliseconds, if known.'),
          })
          .describe('A time window during which this alert is active.'),
      )
      .describe('Time windows when this alert is active.'),
    url: z.string().nullable().describe('URL for more information about this alert, or null.'),
  }),
  errors: [
    {
      reason: 'situation_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Situation ID does not exist on this instance.',
      recovery:
        'Obtain situation IDs from onebusaway_get_arrivals — they appear in situations[].id and arrivals[].situationIds.',
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

  async handler(input, ctx) {
    const alert = await getOneBusAwayService().getAlert(input.situationId, ctx);
    ctx.log.info('getAlert completed', { situationId: input.situationId });
    return alert;
  },

  format: (result) => {
    const lines: string[] = [`## ${result.summary || 'Service Alert'} (${result.id})`];
    lines.push(`**Description:** ${orNone(result.description)}`);
    lines.push(`**Reason:** ${orNone(result.reason)}`);
    lines.push(`**Severity:** ${orNone(result.severity)}`);
    lines.push(`**Consequence:** ${orNone(result.consequenceMessage)}`);
    lines.push(`**More info:** ${orNone(result.url)}`);

    if (result.activeWindows.length > 0) {
      lines.push('\n**Active windows:**');
      for (const w of result.activeWindows) {
        const fromStr = w.from != null ? `${fmtMs(w.from)} (from:${w.from})` : 'open start';
        const toStr = w.to != null ? `${fmtMs(w.to)} (to:${w.to})` : 'open end';
        lines.push(`- ${fromStr} → ${toStr}`);
      }
    }

    if (result.affects.length > 0) {
      lines.push('\n**Affects:**');
      for (const a of result.affects) {
        lines.push(
          `- agency:${orNone(a.agencyId)} route:${orNone(a.routeId)} stop:${orNone(a.stopId)} trip:${orNone(a.tripId)}`,
        );
      }
    }

    if (result.consequences.length > 0) {
      lines.push('\n**Consequences:**');
      for (const c of result.consequences) {
        lines.push(`- ${orNone(c.condition)}`);
        lines.push(`  Diversion stops: ${listOrNone(c.diversionStopIds ?? [])}`);
      }
    }

    return [{ type: 'text', text: lines.join('\n') }];
  },
});
