/**
 * @fileoverview Fetch the full-day block schedule for a vehicle by block ID.
 * @module mcp-server/tools/definitions/get-block.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { listOrNone } from '@/mcp-server/tools/format-helpers.js';
import {
  checkTripSelectors,
  renderSelection,
  selectionCountFields,
  tripSelectionSchema,
  tripSelectorFields,
} from '@/mcp-server/tools/schedule-selection.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

/** Format seconds-from-midnight (GTFS) as HH:MM. */
function fmtSec(secs: number): string {
  const h = Math.floor(secs / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}`;
}

const blockConfiguration = z.object({
  activeServiceIds: z
    .array(z.string())
    .describe('Service IDs required active for this configuration.'),
  inactiveServiceIds: z
    .array(z.string())
    .describe('Service IDs required inactive for this configuration.'),
  trips: z
    .array(
      z
        .object({
          tripId: z.string().describe('Trip ID for follow-up onebusaway_get_trip calls.'),
          distanceAlongBlock: z
            .number()
            .describe(
              'Cumulative distance (meters) from block start to the first stop of this trip.',
            ),
          accumulatedSlackTime: z
            .number()
            .describe('Accumulated layover/slack time (seconds) before this trip starts.'),
          blockStopTimes: z
            .array(
              z
                .object({
                  stopId: z.string().describe('Stop ID.'),
                  arrivalTime: z.number().describe('Arrival in GTFS seconds from midnight.'),
                  departureTime: z.number().describe('Departure in GTFS seconds from midnight.'),
                  pickupType: z
                    .number()
                    .optional()
                    .describe(
                      'GTFS pickup type (0=regular, 1=no pickup, 2=phone agency, 3=coordinate with driver).',
                    ),
                  dropOffType: z
                    .number()
                    .optional()
                    .describe(
                      'GTFS drop-off type (0=regular, 1=no dropoff, 2=phone agency, 3=coordinate with driver).',
                    ),
                })
                .describe('A stop time.'),
            )
            .describe('Ordered stop times.'),
        })
        .describe('A block trip.'),
    )
    .describe('Ordered trips in this configuration.'),
});

export const getBlock = tool('onebusaway_get_block', {
  title: 'Get Block Schedule',
  description:
    'Fetch block trip sequences with their stop times and service-calendar conditions. Top-level fields describe the first returned configuration; every remaining alternative is included without choosing a calendar date. Optionally select an exact tripId or complete trips having any departure in a half-open GTFS-seconds interval, independently in every configuration; selection counts trip occurrences before and after filtering. Without selectors, returns all trips with no default cap. Block IDs appear as blockId in onebusaway_get_trip responses; obtain a tripId from onebusaway_get_arrivals first.',
  annotations: { readOnlyHint: true },
  input: z
    .object({
      ...tripSelectorFields,
      blockId: z
        .string()
        .min(1)
        .describe(
          'Block ID from a trip record. Obtain a tripId from onebusaway_get_arrivals, then call onebusaway_get_trip to get the blockId.',
        ),
    })
    .superRefine(checkTripSelectors),
  output: z.object({
    selection: tripSelectionSchema
      .extend({
        configurationCounts: z
          .array(
            z
              .object(selectionCountFields)
              .describe('Trip occurrence counts for one configuration.'),
          )
          .describe(
            'Preserved slot order: index 0 is the top-level first configuration; index 1 is alternateConfigurations[0], and so on, including empty slots.',
          ),
      })
      .optional()
      .describe(
        'Applied selectors and aggregate trip occurrence counts across every configuration; absent without selectors.',
      ),
    blockId: z.string().describe('Block ID.'),
    activeServiceIds: z
      .array(z.string())
      .describe('Service IDs required active for the first returned configuration.'),
    inactiveServiceIds: z
      .array(z.string())
      .describe('Service IDs required inactive for the first returned configuration.'),
    trips: blockConfiguration.shape.trips.describe(
      'All trips in the first returned configuration, in order.',
    ),
    alternateConfigurations: z
      .array(blockConfiguration.describe('An alternative block configuration.'))
      .describe('Remaining configurations in upstream order; empty when none exist.'),
  }),
  errors: [
    {
      reason: 'block_not_found',
      code: JsonRpcErrorCode.NotFound,
      when: 'Block ID does not exist on this instance.',
      recovery:
        'Obtain a blockId from onebusaway_get_trip. First call onebusaway_get_arrivals to get a tripId, then onebusaway_get_trip to retrieve the blockId.',
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
    notice: z
      .string()
      .optional()
      .describe('Alternative-configuration guidance or an aggregate empty-selection notice.'),
  },

  async handler(input, ctx) {
    const selectors = {
      ...(input.tripId?.trim() && { tripId: input.tripId }),
      ...(input.departureFromSec !== undefined && { departureFromSec: input.departureFromSec }),
      ...(input.departureBeforeSec !== undefined && {
        departureBeforeSec: input.departureBeforeSec,
      }),
    };
    const service = getOneBusAwayService();
    const block =
      Object.keys(selectors).length > 0
        ? await service.getBlock(input.blockId, ctx, selectors)
        : await service.getBlock(input.blockId, ctx);
    ctx.log.info('getBlock completed', {
      blockId: input.blockId,
      tripCount: block.trips.length,
    });
    const notices: string[] = [];
    if (block.alternateConfigurations.length > 0)
      notices.push(
        'Top-level fields describe the first returned configuration; alternative trip sequences are included with their calendar conditions.',
      );
    if (block.selection?.returned === 0)
      notices.push('No trips matched the applied selection in any configuration.');
    if (notices.length > 0) ctx.enrich.notice(notices.join(' '));
    return block;
  },

  format: (result) => {
    const lines: string[] = [
      `## Block ${result.blockId}`,
      '**First returned configuration** (service IDs are calendar conditions)',
      `**Trips:** ${result.trips.length}`,
      `**Active service IDs:** ${listOrNone(result.activeServiceIds)}`,
      `**Inactive service IDs:** ${listOrNone(result.inactiveServiceIds)}`,
    ];
    if (result.selection) {
      lines.push(renderSelection(result.selection));
      for (const [index, count] of result.selection.configurationCounts.entries())
        lines.push(
          `**Configuration ${index} (${index === 0 ? 'first returned' : `alternative ${index}`}):** total: ${count.total} | returned: ${count.returned}`,
        );
      if (result.selection.returned === 0)
        lines.push('No trips matched the applied selection in any configuration.');
    }

    const configurations = [result, ...result.alternateConfigurations];
    lines.push(`**Alternate configurations:** ${result.alternateConfigurations.length}`);
    if (result.alternateConfigurations.length > 0)
      lines.push(
        "Alternative trip sequences follow; no configuration is selected by today's date.",
      );
    for (const [index, configuration] of configurations.entries()) {
      if (index > 0)
        lines.push(
          `\n## Alternative configuration ${index}`,
          `**Active service IDs:** ${listOrNone(configuration.activeServiceIds)}`,
          `**Inactive service IDs:** ${listOrNone(configuration.inactiveServiceIds)}`,
          `**Trips:** ${configuration.trips.length}`,
        );
      for (const [i, t] of configuration.trips.entries()) {
        const first = t.blockStopTimes[0];
        const last = t.blockStopTimes[t.blockStopTimes.length - 1];
        const startTime = first ? fmtSec(first.departureTime) : 'N/A';
        const endTime = last ? fmtSec(last.arrivalTime) : 'N/A';
        lines.push(`\n### Trip ${i + 1}: ${t.tripId}`);
        lines.push(`**Starts:** ${startTime} | **Ends:** ${endTime}`);
        lines.push(
          `**Stops:** ${t.blockStopTimes.length} | **Distance (distanceAlongBlock):** ${t.distanceAlongBlock}m from block start`,
        );
        lines.push(`**Accumulated slack (accumulatedSlackTime):** ${t.accumulatedSlackTime}s`);
        for (const bst of t.blockStopTimes) {
          const pickup = bst.pickupType != null ? ` pickup:${bst.pickupType}` : '';
          const dropoff = bst.dropOffType != null ? ` dropoff:${bst.dropOffType}` : '';
          lines.push(
            `- stopId:${bst.stopId} arr ${fmtSec(bst.arrivalTime)} [arrivalTime:${bst.arrivalTime}] dep ${fmtSec(bst.departureTime)} [departureTime:${bst.departureTime}]${pickup}${dropoff}`,
          );
        }
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
