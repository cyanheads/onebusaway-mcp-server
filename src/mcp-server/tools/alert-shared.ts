/**
 * @fileoverview Full service-alert (situation) shape and rendering shared by
 *   onebusaway_get_alert and onebusaway_get_stop_context, so an alert reads the
 *   same whichever tool returned it.
 * @module mcp-server/tools/alert-shared
 */

import { z } from '@cyanheads/mcp-ts-core';
import { listOrNone, orNone } from '@/mcp-server/tools/format-helpers.js';

/** Fields of one service alert in full detail. */
export const alertDetailShape = {
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
};

type AlertDetail = z.infer<z.ZodObject<typeof alertDetailShape>>;

/** Format Unix milliseconds as a readable date-time string. */
function fmtMs(ms: number): string {
  return new Date(ms).toLocaleString();
}

/** Markdown lines for one alert, opening with a `heading`-level title (e.g. `##`). */
export function renderAlertDetail(alert: AlertDetail, heading: string): string[] {
  const lines: string[] = [`${heading} ${alert.summary || 'Service Alert'} (${alert.id})`];
  lines.push(`**Description:** ${orNone(alert.description)}`);
  lines.push(`**Reason:** ${orNone(alert.reason)}`);
  lines.push(`**Severity:** ${orNone(alert.severity)}`);
  lines.push(`**Consequence:** ${orNone(alert.consequenceMessage)}`);
  lines.push(`**More info:** ${orNone(alert.url)}`);

  if (alert.activeWindows.length > 0) {
    lines.push('\n**Active windows:**');
    for (const w of alert.activeWindows) {
      const fromStr = w.from != null ? `${fmtMs(w.from)} (from:${w.from})` : 'open start';
      const toStr = w.to != null ? `${fmtMs(w.to)} (to:${w.to})` : 'open end';
      lines.push(`- ${fromStr} → ${toStr}`);
    }
  }

  if (alert.affects.length > 0) {
    lines.push('\n**Affects:**');
    for (const a of alert.affects) {
      lines.push(
        `- agency:${orNone(a.agencyId)} route:${orNone(a.routeId)} stop:${orNone(a.stopId)} trip:${orNone(a.tripId)}`,
      );
    }
  }

  if (alert.consequences.length > 0) {
    lines.push('\n**Consequences:**');
    for (const c of alert.consequences) {
      lines.push(`- ${orNone(c.condition)}`);
      lines.push(`  Diversion stops: ${listOrNone(c.diversionStopIds ?? [])}`);
    }
  }

  return lines;
}
