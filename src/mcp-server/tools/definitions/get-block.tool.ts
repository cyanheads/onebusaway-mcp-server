/**
 * @fileoverview Fetch the full-day block schedule for a vehicle by block ID.
 * @module mcp-server/tools/definitions/get-block.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { listOrNone } from '@/mcp-server/tools/format-helpers.js';
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

export const getBlock = tool('onebusaway_get_block', {
  title: 'Get Block Schedule',
  description:
    "Fetch the full-day block schedule for a vehicle by block ID. A block is the ordered sequence of trips a single vehicle makes in one service day. Returns all trips in order with their stop times. Useful for 'when will this bus return?' and fleet tracking. Block IDs appear in onebusaway_get_trip responses under the schedule block field; obtain a tripId from onebusaway_get_arrivals first.",
  annotations: { readOnlyHint: true },
  input: z.object({
    blockId: z
      .string()
      .min(1)
      .describe(
        'Block ID from a trip record. Obtain a tripId from onebusaway_get_arrivals, then call onebusaway_get_trip to get the blockId.',
      ),
  }),
  output: z.object({
    blockId: z.string().describe('Block ID.'),
    activeServiceIds: z
      .array(z.string())
      .describe('Service calendar IDs active for this block today.'),
    inactiveServiceIds: z
      .array(z.string())
      .describe('Service calendar IDs not active for this block today.'),
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
                    arrivalTime: z
                      .number()
                      .describe('Scheduled arrival time as seconds from midnight (GTFS format).'),
                    departureTime: z
                      .number()
                      .describe('Scheduled departure time as seconds from midnight (GTFS format).'),
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
                  .describe('A scheduled stop time within this trip.'),
              )
              .describe('Ordered stop times for this trip.'),
          })
          .describe('A trip in this vehicle block.'),
      )
      .describe('All trips in this block in order.'),
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

  async handler(input, ctx) {
    const block = await getOneBusAwayService().getBlock(input.blockId, ctx);
    ctx.log.info('getBlock completed', {
      blockId: input.blockId,
      tripCount: block.trips.length,
    });
    return block;
  },

  format: (result) => {
    const lines: string[] = [
      `## Block ${result.blockId}`,
      `**Trips:** ${result.trips.length}`,
      `**Active service IDs:** ${listOrNone(result.activeServiceIds)}`,
      `**Inactive service IDs:** ${listOrNone(result.inactiveServiceIds)}`,
    ];

    for (const [i, t] of result.trips.entries()) {
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
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
