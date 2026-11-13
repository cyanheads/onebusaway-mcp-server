/**
 * @fileoverview OneBusAway stop metadata resource.
 * @module mcp-server/resources/definitions/stop.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { oneBusAwayIdSchema } from '@/services/onebusaway/identifier.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const title = 'OneBusAway Stop';

export const stopResource = resource('onebusaway://stop/{stopId}', {
  name: 'onebusaway-stop',
  title,
  description:
    'Stop metadata including name, coordinates, served route IDs, available route summaries, and wheelchair accessibility. Use a raw agency-prefixed stop ID (e.g. "1_75403").',
  mimeType: 'application/json',
  params: z.object({
    stopId: oneBusAwayIdSchema.describe(
      'Agency-prefixed stop ID (e.g. "1_75403" for Metro Transit stop 75403).',
    ),
  }),

  async handler(params, ctx) {
    ctx.log.debug('stopResource handler', { stopId: params.stopId });
    const stop = await getOneBusAwayService().getStop(params.stopId, ctx);
    return stop;
  },

  list: async () => ({
    resources: [
      {
        uri: 'onebusaway://stop/1_75403',
        name: 'Example: Metro Transit Stop 75403',
        title,
        mimeType: 'application/json',
        description: 'Stop metadata for Metro Transit stop 75403 (Puget Sound instance).',
      },
    ],
  }),
});
