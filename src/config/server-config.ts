/**
 * @fileoverview Server-specific configuration for onebusaway-mcp-server.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const PUGET_SOUND_BASE_URL = 'https://api.pugetsound.onebusaway.org';

const ServerConfigSchema = z.object({
  apiKey: z
    .string()
    .default('TEST')
    .describe('OneBusAway API key. TEST works on Puget Sound for development.'),
  baseUrl: z
    .string()
    .default(PUGET_SOUND_BASE_URL)
    .describe('Base URL for the OneBusAway instance.'),
  rateLimitRequests: z.coerce
    .number()
    .int()
    .positive()
    .default(20)
    .describe(
      'Upstream requests the pacer allows per window. Sized to the API key budget; the sliding window permits a burst up to this many.',
    ),
  rateLimitWindowMs: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000)
    .describe('Width of the pacer’s sliding rate window, in milliseconds.'),
  rateLimitMaxWaitMs: z.coerce
    .number()
    .int()
    .positive()
    .default(45_000)
    .describe(
      'Longest a call may wait in the pacer queue, in milliseconds. Keep it under the SDK client’s 60 s request timeout so a queued call fails as rate_limited rather than as a transport timeout.',
    ),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    apiKey: 'ONEBUSAWAY_API_KEY',
    baseUrl: 'ONEBUSAWAY_BASE_URL',
    rateLimitRequests: 'ONEBUSAWAY_RATE_LIMIT_REQUESTS',
    rateLimitWindowMs: 'ONEBUSAWAY_RATE_LIMIT_WINDOW_MS',
    rateLimitMaxWaitMs: 'ONEBUSAWAY_RATE_LIMIT_MAX_WAIT_MS',
  });
  return _config;
}
