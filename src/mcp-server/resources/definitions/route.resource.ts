/**
 * @fileoverview OneBusAway route metadata resource.
 * @module mcp-server/resources/definitions/route.resource
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { oneBusAwayIdSchema } from '@/services/onebusaway/identifier.js';
import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const title = 'OneBusAway Route';

export const routeResource = resource('onebusaway://route/{routeId}', {
  name: 'onebusaway-route',
  title,
  description:
    'Route metadata — short name, description, agency, schedule URL. Route IDs use agency-prefixed format: {agencyId}_{localId} (e.g. "1_100259").',
  mimeType: 'application/json',
  params: z.object({
    routeId: oneBusAwayIdSchema.describe(
      'Agency-prefixed route ID (e.g. "1_100259" for Metro Transit route 100259).',
    ),
  }),

  async handler(params, ctx) {
    ctx.log.debug('routeResource handler', { routeId: params.routeId });
    const route = await getOneBusAwayService().getRoute(params.routeId, ctx);
    return route;
  },

  list: async () => ({
    resources: [
      {
        uri: 'onebusaway://route/1_100259',
        name: 'Example: Metro Transit Route 100259',
        title,
        mimeType: 'application/json',
        description: 'Route metadata for Metro Transit route 100259 (Puget Sound instance).',
      },
    ],
  }),
});
