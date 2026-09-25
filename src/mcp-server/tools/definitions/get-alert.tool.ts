/**
 * @fileoverview Fetch full detail for a service alert by situation ID.
 * @module mcp-server/tools/definitions/get-alert.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { alertDetailShape, renderAlertDetail } from '@/mcp-server/tools/alert-shared.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

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
  output: z.object(alertDetailShape),
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

  format: (result) => [{ type: 'text', text: renderAlertDetail(result, '##').join('\n') }],
});
