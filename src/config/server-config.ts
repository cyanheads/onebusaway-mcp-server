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
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

let _config: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    apiKey: 'ONEBUSAWAY_API_KEY',
    baseUrl: 'ONEBUSAWAY_BASE_URL',
  });
  return _config;
}
